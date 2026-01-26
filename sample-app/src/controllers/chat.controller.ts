import { App } from 'qhttpx';
import jwt from 'jsonwebtoken';

export class ChatController {
    constructor(private app: App) {}

    registerRoutes() {
        this.app.get('/chat/history')
            .query(q => q.int('limit').optional().min(1).max(100))
            .queryState(['limit'])
            .transform((state) => {
                let limit = 50;
                if (typeof state.limit === 'number') limit = state.limit;
                if (typeof state.limit === 'string') {
                    const parsed = Number.parseInt(state.limit, 10);
                    if (!Number.isNaN(parsed)) limit = parsed;
                }
                return { limit };
            })
            .sql(
                'SELECT * FROM messages WHERE recipient_email IS NULL ORDER BY created_at DESC LIMIT $1',
                (state) => [state.limit]
            )
            .use((_ctx, state) => Array.isArray(state) ? state.reverse() : state)
            .respond();

        this.app.get('/chat/dm-history')
            .secure()
            .query(q => q.int('limit').optional().min(1).max(100))
            .queryState(['limit'])
            .ensure((state) => !!state.user?.email, 'Unauthorized', 401)
            .transform((state) => {
                let limit = 50;
                if (typeof state.limit === 'number') limit = state.limit;
                if (typeof state.limit === 'string') {
                    const parsed = Number.parseInt(state.limit, 10);
                    if (!Number.isNaN(parsed)) limit = parsed;
                }
                return { limit, email: state.user.email };
            })
            .sql(
                `
                    SELECT * FROM messages 
                    WHERE (recipient_email = $1) 
                       OR (sender_email = $1 AND recipient_email IS NOT NULL)
                    ORDER BY created_at DESC LIMIT $2
                `,
                (state) => [state.email, state.limit]
            )
            .use((_ctx, state) => Array.isArray(state) ? state.reverse() : state)
            .respond();
    }

    handler() {
        const app = this.app;

        return {
            open: async (ws: any) => {
                console.log('WS Opened');
                ws.subscribe('chat');
                
                // Load public chat history
                try {
                    // Fetch last 50 public messages
                    const sql = `SELECT * FROM messages WHERE recipient_email IS NULL ORDER BY created_at DESC LIMIT 50`;
                    const resStr = await app.db.query(sql);
                    const messages = JSON.parse(resStr).reverse(); // Reverse to show oldest -> newest
                    
                    messages.forEach((m: any) => {
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            user: m.sender_email, 
                            text: m.content 
                        }));
                    });
                } catch (e) {
                    console.error('Failed to load public history:', e);
                }

                ws.send(JSON.stringify({ type: 'info', message: 'Welcome to the chat!' }));
            },
            message: async (ws: any, msg: string) => {
                // console.log('WS Message:', msg);
                const secret = process.env.JWT_SECRET || 'secret';
                try {
                    const data = JSON.parse(msg);
                    
                    if (data.type === 'auth') {
                        try {
                            const payload = jwt.verify(data.token, secret) as any;
                            ws.email = payload.email;
                            ws.subscribe(`user:${payload.email}`);
                            ws.send(JSON.stringify({ type: 'auth_success', email: payload.email }));
                            ws.send(JSON.stringify({ type: 'info', message: `Authenticated as ${payload.email}` }));
                            console.log(`User authenticated: ${payload.email}`);

                            // Load DM history
                            const sql = `
                                SELECT * FROM messages 
                                WHERE (recipient_email = '${payload.email}') 
                                   OR (sender_email = '${payload.email}' AND recipient_email IS NOT NULL)
                                ORDER BY created_at DESC LIMIT 50
                            `;
                            const resStr = await app.db.query(sql);
                            const messages = JSON.parse(resStr).reverse();

                            messages.forEach((m: any) => {
                                const isOwn = m.sender_email === payload.email;
                                const user = isOwn ? `Me -> ${m.recipient_email}` : `[DM] ${m.sender_email}`;
                                ws.send(JSON.stringify({ 
                                    type: 'dm', 
                                    from: m.sender_email, // Frontend handles display based on this
                                    text: m.content,
                                    // Helper for frontend to reconstruct UI state if needed
                                    to: m.recipient_email
                                }));
                            });

                        } catch (e) {
                            console.error(e);
                            ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
                        }
                        return;
                    }

                    if (data.type === 'chat') {
                        const user = ws.email || 'Anonymous';
                        const safeText = data.text.replace(/'/g, "''");
                        
                        // Persist
                        try {
                            await app.db.query(`INSERT INTO messages (sender_email, content) VALUES ('${user}', '${safeText}')`);
                        } catch(e) {
                            console.error('Failed to save message:', e);
                        }

                        // Broadcast
                        ws.publish('chat', JSON.stringify({ type: 'chat', user, text: data.text }));
                    } else if (data.type === 'dm') {
                        console.log('DM received. WS Email:', ws.email, 'Token provided:', !!data.token);
                        
                        // Stateless Auth Fallback
                        if (!ws.email && data.token) {
                            try {
                                console.log('Attempting stateless auth for DM...');
                                const payload = jwt.verify(data.token, secret) as any;
                                console.log('Stateless auth payload:', payload);
                                ws.email = payload.email;
                                // Also ensure subscription if missing
                                ws.subscribe(`user:${payload.email}`);
                                console.log('Stateless auth successful. Email set to:', ws.email);
                            } catch (e: any) {
                                console.error('DM Auth Fallback Failed:', e.message);
                                ws.send(JSON.stringify({ type: 'error', message: `Token Error: ${e.message}` }));
                                return;
                            }
                        }

                        if (!ws.email) {
                            console.log('DM rejected: No email set on WS connection.');
                            ws.send(JSON.stringify({ type: 'error', message: `You must be logged in to send DMs. Debug: Token present=${!!data.token}` }));
                            return;
                        }
                        if (!data.to) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Recipient email required' }));
                            return;
                        }

                        const safeText = data.text.replace(/'/g, "''");
                        const safeTo = data.to.replace(/'/g, "''");

                        // Persist
                        try {
                            await app.db.query(`
                                INSERT INTO messages (sender_email, recipient_email, content) 
                                VALUES ('${ws.email}', '${safeTo}', '${safeText}')
                            `);
                        } catch(e) {
                            console.error('Failed to save DM:', e);
                        }

                        // Send to recipient
                        const payload = JSON.stringify({ 
                            type: 'dm', 
                            from: ws.email, 
                            text: data.text 
                        });
                        ws.publish(`user:${data.to}`, payload);
                    }
                } catch (e) {
                    console.error('WS Error:', e);
                }
            },
            close: (ws: any) => {
                // console.log('WS Closed');
                ws.unsubscribe('chat');
                if (ws.email) {
                    ws.unsubscribe(`user:${ws.email}`);
                }
            }
        };
    }
}
