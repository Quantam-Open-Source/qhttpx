import { Q } from '../src';

const app = Q.app();

app.listen(3000, () => {
    console.log("Server started on port 3000");
});
