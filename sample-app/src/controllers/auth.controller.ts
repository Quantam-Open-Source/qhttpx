import { App } from 'qhttpx';

export const registerAuthRoutes = (app: App) => {
    app.post('/auth/signup')
        .validate({ email: 'email', password: 'string' })
        .hash('password')
        .insert('users')
        .respond(201);

    app.post('/auth/login')
        .validate({ email: 'email', password: 'string' })
        .find('users', 'email')
        .ensure(user => !!user, 'User not found', 404)
        .verifyPassword('password')
        .jwt()
        .respond(200);
};
