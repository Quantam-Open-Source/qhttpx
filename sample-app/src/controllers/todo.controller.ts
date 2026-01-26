import { App } from 'qhttpx';

export const registerTodoRoutes = (app: App) => {
    app.get('/todos')
        .secure()
        .list('todos', { where: { user_id: '@user.id' } })
        .respond();

    app.post('/todos')
        .secure()
        .validate({ title: 'string' })
        .transform(s => ({ title: s.title, user_id: s.user.id }))
        .insert('todos')
        .respond(201);

    app.put('/todos/:id')
        .secure()
        .validate({ completed: 'boolean' })
        .update('todos', { where: { id: ':id', user_id: '@user.id' }, fields: ['completed'] })
        .respond();

    app.delete('/todos/:id')
        .secure()
        .delete('todos', { where: { id: ':id', user_id: '@user.id' } })
        .respond();
};
