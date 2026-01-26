import { Q } from '../src';

const app = Q.app();

// POST /users - Create a user from JSON body
app.post('/users')
   .use((ctx, state) => {
       try {
           const user = ctx.json<{ name: string, email: string }>();
           return { 
               message: "User created", 
               user,
               id: Math.floor(Math.random() * 1000)
           };
       } catch (e) {
           throw { error: "Invalid JSON", status: 400 };
       }
   })
   .status(201)
   .respond();

// POST /echo - Echo text body
app.post('/echo')
   .use((ctx, state) => {
       const text = ctx.text();
       return `Echo: ${text}`;
   })
   .respond();

app.listen(3000, () => {
    console.log('Body Parsing Demo running on port 3000');
});
