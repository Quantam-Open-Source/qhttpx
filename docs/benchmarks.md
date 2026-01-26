# Benchmarking Results

This document contains performance benchmarks for QHTTPX, demonstrating its high-throughput and low-latency capabilities.

## Test Environment

The benchmarks below were conducted on the following hardware configuration:

*   **Operating System**: Windows
*   **CPU**: 2 vCPU
*   **RAM**: 8 GB

## QHTTPX Performance

The following results demonstrate the raw performance of the QHTTPX server under load.

**Command**: `npm run benchmark:qhttpx`
**Configuration**:
*   **Duration**: 160s
*   **Connections**: 100
*   **Pipelining**: 50

| Metric | Value |
| :--- | :--- |
| **Requests / Sec** | **44,667.9** |
| **Throughput** | **18.96 MB/s** |
| **Latency (Avg)** | **229 ms** |
| **Latency (p50)** | **178 ms** |
| **Latency (p99)** | **761 ms** |
| **Total Requests** | **3,578,000** |

> *Note: These results represent QHTTPX standalone performance (160s stress test).*

## Comparative Analysis

We benchmarked QHTTPX against popular Node.js frameworks to measure relative performance. All frameworks served the same JSON payload.

**Command**: `npm run benchmark`
**Configuration**:
*   **Duration**: 40s
*   **Connections**: 100
*   **Pipelining**: 50

### Requests Per Second (Throughput)

| Framework | Req/Sec | Multiplier |
| :--- | :--- | :--- |
| **Express** | 9,094 | 1.0x (Baseline) |
| **Koa** | 11,381 | 1.25x |
| **Fastify** | 12,265 | 1.35x |
| **QHTTPX** | **45,136** | **4.96x** |

### Latency (Average)

Lower is better.

| Framework | Latency |
| :--- | :--- |
| **Express** | 639.72 ms |
| **Koa** | 504.44 ms |
| **Fastify** | 454.32 ms |
| **QHTTPX** | **268.09 ms** |

> *Conclusion: In this test environment, QHTTPX handles approximately **5x more traffic than Express** and **3.7x more than Fastify**, with significantly lower latency.*

## Extreme Load Test (C10K)

We pushed the limits by simulating **10,000 concurrent connections** (C10K problem) to test stability and crash resistance.

**Configuration**:
*   **Duration**: 20s
*   **Connections**: 10,000
*   **Pipelining**: 10

### Stability Results

| Framework | Status | Req/Sec | Total Req | Latency (Avg) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Express** | ❌ FAILED | 0 | 0 | N/A | 100% Timeout / Errors |
| **Koa** | ❌ FAILED | 0 | 0 | N/A | 100% Timeout / Errors |
| **Fastify** | ❌ FAILED | 0 | 0 | N/A | 100% Timeout / Errors |
| **QHTTPX** | **✅ PASS** | **18,494** | **147,930** | **200.68 ms** | **Zero crashes**, handled load successfully |

### Final Verdict

*   **Express**: 0 requests (Baseline)
*   **QHTTPX**: **Infinity x** Express (147,930 requests served vs 0)

> **Verdict**: Under extreme load where traditional Node.js frameworks stalled completely (0 req/sec), QHTTPX maintained stability, serving **147,930 total requests** with an average latency of **200ms**.

## Summary

These benchmarks demonstrate that QHTTPX is not just an incremental improvement, but a generational leap in Node.js server performance.

1.  **Raw Power**: Consistently delivers **4x-5x higher throughput** than standard frameworks.
2.  **Responsiveness**: Cuts latency in half, ensuring snappy responses even under heavy load.
3.  **Resilience**: The only framework in our test suite to survive the **C10K (10,000 concurrent connections)** stress test without crashing or stalling.

By leveraging a hybrid architecture (Rust core + Node.js flexibility), QHTTPX allows you to build applications that are easy to write (TypeScript/JavaScript) but perform like native systems code.
