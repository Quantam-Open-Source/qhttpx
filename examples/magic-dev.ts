
import { Q } from '../src';

const app = Q.app();

app.get('/', () => {
    return { 
        message: "Hello from Magic Dev Mode! ✨", 
        timestamp: new Date().toISOString() 
    };
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
