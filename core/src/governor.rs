use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::collections::VecDeque;
use tokio::sync::oneshot;
use tracing::info;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Priority {
    Critical,
    Interactive,
    Background,
}

impl Priority {
    pub fn from_str(s: &str) -> Self {
        match s {
            "critical" => Priority::Critical,
            "background" => Priority::Background,
            _ => Priority::Interactive,
        }
    }
}

struct Inner {
    current_limit: usize,
    inflight: usize,
    waiters_critical: VecDeque<oneshot::Sender<()>>,
    waiters_interactive: VecDeque<oneshot::Sender<()>>,
    waiters_background: VecDeque<oneshot::Sender<()>>,
}

impl Inner {
    fn new(min: usize) -> Self {
        Self {
            current_limit: min,
            inflight: 0,
            waiters_critical: VecDeque::new(),
            waiters_interactive: VecDeque::new(),
            waiters_background: VecDeque::new(),
        }
    }

    fn has_waiters(&self) -> bool {
        !self.waiters_critical.is_empty() || 
        !self.waiters_interactive.is_empty() || 
        !self.waiters_background.is_empty()
    }
}

pub struct TrafficGovernor {
    // Configuration
    target_latency_ms: AtomicU64,
    min_concurrency: usize,
    max_concurrency: usize,

    // State
    inner: Mutex<Inner>,

    // Metrics
    shed_requests: AtomicU64,
}

impl TrafficGovernor {
    pub fn new(target_ms: u64, min: usize, max: usize) -> Self {
        Self {
            target_latency_ms: AtomicU64::new(target_ms),
            min_concurrency: min,
            max_concurrency: max,
            inner: Mutex::new(Inner::new(min)),
            shed_requests: AtomicU64::new(0),
        }
    }

    pub async fn acquire(&self, priority: Priority) {
        let rx = {
            let mut inner = self.inner.lock().unwrap();
            
            // Check if we can admit immediately
            // We can admit if:
            // 1. Inflight < Limit (AND no higher priority waiters, to be fair)
            // 2. OR Priority is Critical and Inflight < Max (bypass limit)
            
            let limit = inner.current_limit;
            let can_admit = match priority {
                Priority::Critical => inner.inflight < self.max_concurrency,
                _ => inner.inflight < limit && !inner.has_waiters(), 
            };

            if can_admit {
                inner.inflight += 1;
                return;
            }

            // Queue
            let (tx, rx) = oneshot::channel();
            match priority {
                Priority::Critical => inner.waiters_critical.push_back(tx),
                Priority::Interactive => inner.waiters_interactive.push_back(tx),
                Priority::Background => inner.waiters_background.push_back(tx),
            }
            rx
        };

        // Wait for permit
        if let Ok(_) = rx.await {
            // We have been woken up, and inflight was already incremented by the waker
            return;
        } else {
            // Sender dropped? Should not happen unless logic bug or shutdown
            // If it happens, we treat it as admitted? No, if dropped, we were not admitted?
            // Actually, if sender is dropped without sending, it means we were NOT woken up?
            // But if we are here, we are awoken.
            // oneshot::RecvError means the Sender was dropped.
            // If sender is dropped, it means the Governor was dropped?
            // Safe to return.
        }
    }

    pub fn release(&self, latency_ms: u64, target_override: Option<u64>) {
        let mut inner = self.inner.lock().unwrap();
        if inner.inflight > 0 {
            inner.inflight -= 1;
        }
        
        // Update Limit
        let target = target_override.unwrap_or(self.target_latency_ms.load(Ordering::Relaxed));
        let limit = inner.current_limit;

        if latency_ms >= target {
            // Congestion: Decrease
            let new_limit = (limit as f64 * 0.95) as usize;
            let new_limit = new_limit.max(self.min_concurrency);
            if new_limit != limit {
                info!("Load shedding: decreasing concurrency limit to {}", new_limit);
                inner.current_limit = new_limit;
            }
        } else {
            // Healthy: Increase
            if limit < self.max_concurrency {
                // Slow start / additive increase
                // Only increase if we are somewhat utilizing the limit?
                // For now, simple additive
                 if inner.inflight > limit / 2 {
                    let new_limit = limit + 1;
                    if new_limit % 10 == 0 {
                        // info!("System healthy: increasing concurrency limit to {}", new_limit);
                    }
                    inner.current_limit = new_limit;
                 }
            }
        }

        // Process Waiters
        self.process_waiters(&mut inner);
    }

    fn process_waiters(&self, inner: &mut Inner) {
        // While we have capacity, wake up waiters
        // Critical always gets slot if inflight < max
        // Others respect limit
        
        loop {
            // 1. Critical
            if inner.inflight < self.max_concurrency {
                if let Some(tx) = inner.waiters_critical.pop_front() {
                    inner.inflight += 1;
                    if let Err(_) = tx.send(()) {
                        inner.inflight -= 1; // Waker dropped
                        continue;
                    }
                    continue; // Loop to see if we can wake more
                }
            }

            // 2. Interactive & Background (Respect Dynamic Limit)
            if inner.inflight < inner.current_limit {
                if let Some(tx) = inner.waiters_interactive.pop_front() {
                    inner.inflight += 1;
                    if let Err(_) = tx.send(()) {
                        inner.inflight -= 1;
                        continue;
                    }
                    continue;
                }
                
                // Background (only if interactive empty)
                 if let Some(tx) = inner.waiters_background.pop_front() {
                    inner.inflight += 1;
                    if let Err(_) = tx.send(()) {
                        inner.inflight -= 1;
                        continue;
                    }
                    continue;
                }
            }

            break; // No more capacity or no more waiters
        }
    }
    
    pub fn get_metrics(&self) -> (usize, usize, u64) {
        let inner = self.inner.lock().unwrap();
        (
            inner.current_limit,
            inner.inflight,
            self.shed_requests.load(Ordering::Relaxed),
        )
    }
}
