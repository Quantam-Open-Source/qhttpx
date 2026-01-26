import { App } from 'qhttpx';

export const registerNoteRoutes = (app: App) => {
    app.get('/notes')
        .secure()
        .list('notes', { where: { user_id: '@user.id' } })
        .respond();

    app.post('/notes')
        .secure()
        .validate({ title: 'string' }) // content is optional
        .transform(s => ({ title: s.title, content: s.content || '', user_id: s.user.id }))
        .insert('notes')
        .respond(201);

    app.put('/notes/:id')
        .secure()
        .update('notes', { where: { id: ':id', user_id: '@user.id' }, fields: ['title', 'content'] })
        .respond();

    app.delete('/notes/:id')
        .secure()
        .delete('notes', { where: { id: ':id', user_id: '@user.id' } })
        .respond();
};
