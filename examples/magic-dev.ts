
import { Q } from '../src';

const app = Q.app();

app.get('/')
   .use(() => ({ 
       message: "Hello from Magic Dev Mode! ✨", 
       timestamp: new Date().toISOString() 
   }))
   .respond();

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
