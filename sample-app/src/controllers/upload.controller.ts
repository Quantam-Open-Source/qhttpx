import { App } from 'qhttpx';
import * as fs from 'fs';
import * as path from 'path';

export class UploadController {
    constructor(private app: App) {
        const uploadDir = path.resolve('./uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
    }

    registerRoutes() {
        const uploadDir = path.resolve('./uploads');

        this.app.post('/upload')
            .secure()
            .validate({ name: 'string', data: 'string' })
            .transform((state) => {
                const buffer = Buffer.from(state.data, 'base64');
                const filePath = path.join(uploadDir, state.name);
                fs.writeFileSync(filePath, buffer);
                return { success: true, url: `/uploads/${state.name}` };
            })
            .respond(201);
    }
}
