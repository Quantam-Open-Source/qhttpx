import { App } from 'qhttpx';
import { graphql, buildSchema } from 'graphql';

export const registerSocialRoutes = (app: App) => {
    // 1. Define Schema using SDL
    const schema = buildSchema(`
        type User {
            id: ID!
            email: String!
        }

        type Post {
            id: ID!
            content: String!
            likes: Int!
            createdAt: String!
            user: User!
        }

        type Query {
            posts: [Post!]!
        }

        type Mutation {
            createPost(content: String!): Post!
            likePost(id: ID!): Post!
        }
    `);

    // 2. Define Resolvers
    const rootValue = {
        posts: async (_: any, context: any) => {
            const db = context.db;
            if (!db) throw new Error('Database not connected');
            const sql = `
                SELECT p.id, p.content, p.likes, p.created_at, u.email as user_email, u.id as user_id
                FROM posts p 
                JOIN users u ON p.user_id = u.id 
                ORDER BY p.created_at DESC
            `;
            const rows = JSON.parse(await db.query(sql));
            return rows.map((row: any) => ({
                id: row.id,
                content: row.content,
                likes: row.likes,
                createdAt: row.created_at || new Date().toISOString(),
                user: {
                    id: row.user_id,
                    email: row.user_email
                }
            }));
        },
        createPost: async ({ content }: { content: string }, context: any) => {
            const db = context.db;
            if (!context.user) throw new Error('Unauthorized');
            if (!db) throw new Error('Database not connected');

            const sql = `INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, content, likes, user_id, created_at`;
            const res = JSON.parse(await db.queryWithParams(sql, [context.user.sub, content]));
            const post = res[0];

            const userRes = JSON.parse(await db.queryWithParams(`SELECT email FROM users WHERE id = $1`, [post.user_id]));
            
            return {
                id: post.id,
                content: post.content,
                likes: post.likes,
                createdAt: post.created_at || new Date().toISOString(),
                user: {
                    id: post.user_id,
                    email: userRes[0]?.email
                }
            };
        },
        likePost: async ({ id }: { id: string }, context: any) => {
            const db = context.db;
            if (!db) throw new Error('Database not connected');
            const sql = `UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING id, content, likes, user_id, created_at`;
            const res = JSON.parse(await db.queryWithParams(sql, [id]));
            const post = res[0];

            const userRes = JSON.parse(await db.queryWithParams(`SELECT email FROM users WHERE id = $1`, [post.user_id]));

            return {
                id: post.id,
                content: post.content,
                likes: post.likes,
                createdAt: post.created_at || new Date().toISOString(),
                user: {
                    id: post.user_id,
                    email: userRes[0]?.email
                }
            };
        }
    };

    // 3. Register Endpoint
    app.post('/graphql')
        .use(async (ctx) => {
            const { query, variables } = ctx.req.json();

            let user = null;
            const authHeader = ctx.req.header('authorization');
            if (authHeader) {
                try {
                    const token = authHeader.split(' ')[1];
                    user = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                } catch {}
            }

            const result = await graphql({
                schema,
                source: query,
                rootValue,
                contextValue: { user, db: ctx.db },
                variableValues: variables,
            });

            return result;
        })
        .respond();
};
