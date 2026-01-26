import { Q } from '../src';

const app = Q.app();

// Test Path Parameters
app.get('/users/:id')
    .use((ctx, state) => ({
        type: "params",
        userId: state.params.id,
       message: `Fetching user ${state.params.id}`
   }))
   .respond();

// Test Query Parameters
app.get('/search')
    .queryState(['q', 'page']) // Define query params to extract
    .transform((state) => ({
        query: state.q,
        page: parseInt(state.page || '1')
    }))
    .use((ctx, state) => ({
        type: "query",
        search: state.query,
    }))
    .respond();

app.listen(3000, () => {
    console.log('Query Demo running on port 3000');
});
