import { Q } from 'qhttpx';
import { setupDb } from './config/db';
import { ChatController } from './controllers/chat.controller';
import { registerAuthRoutes } from './controllers/auth.controller';
import { registerTodoRoutes } from './controllers/todo.controller';
import { registerNoteRoutes } from './controllers/note.controller';
import { registerSocialRoutes } from './controllers/social.controller';
import { registerStatsRoutes } from './controllers/stats.controller';
import { UploadController } from './controllers/upload.controller';

const app = Q.app();

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;

// Register Controllers
registerAuthRoutes(app);
registerTodoRoutes(app);
registerNoteRoutes(app);
registerSocialRoutes(app);
registerStatsRoutes(app);

const chatController = new ChatController(app);
chatController.registerRoutes();
const uploadController = new UploadController(app);
uploadController.registerRoutes();

// Chat (WebSocket)
app.ws('/chat', chatController.handler());

// Uploads
app.static('/uploads', './uploads');

// Health
app.get('/health')
    .transform(() => ({ status: 'ok' }))
    .respond();

app.enableLogging();
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    try {
        // Native Config
        app.auth.setJwtSecret(JWT_SECRET);
        console.log('Native JWT Secret Set');
        
        await app.db.connectPostgres(DATABASE_URL);
        console.log('Connected to Postgres');
        
        // Setup Schema
        await setupDb(app);
        
        console.log("System ready.");
    } catch (e) {
        console.error("Startup failed:", e);
        process.exit(1);
    }
});
