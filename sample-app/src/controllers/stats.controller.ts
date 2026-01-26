
import { App } from 'qhttpx';

export const registerStatsRoutes = (app: App) => {
    app.get('/stats')
        .transform(async () => {
            const getCount = async (table: string) => {
                const res = await app.db.query(`SELECT COUNT(*) as count FROM ${table}`);
                const rows = JSON.parse(res);
                return parseInt(rows[0].count, 10);
            };

            const [users, posts, todos, notes] = await Promise.all([
                getCount('users'),
                getCount('posts'),
                getCount('todos'),
                getCount('notes')
            ]);

            return {
                users,
                posts,
                todos,
                notes,
                status: 'ok'
            };
        })
        .respond();
};
