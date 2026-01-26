import { Q } from '../src';

// Initialize the engine
const app = Q.app({
  env: true, // Auto-load .env
  ai: true,  // Enable AI introspection endpoints
});

// Define a schema for typesafe usage
const UserSchema = Q.schema({
  id: Q.string(),
  name: Q.string(),
  email: Q.email(),
  role: Q.enum("admin", "user"),
});

// Fluent API Route
app.get("/api/v1/users")
  .desc("Fetch all users with pagination and filtering")
  .jwt()
  .cache({ ttl: 60 })
  .query((q: any) => q
    .int("page").default(1)
    .int("limit").max(50).default(10)
    .string("role").optional()
  )
  .respond(async (ctx: any) => {
    // Context is fully typed based on .query() above
    const { page, limit, role } = ctx.query;
    
    // AI-Native ORM usage
    const users = await ctx.db.users.findMany({
      where: role ? { role } : undefined,
      take: limit,
      skip: (page - 1) * limit,
    });

    return users;
  });

app.post("/api/v1/upload")
  .desc("Upload large files")
  .respond(async (ctx: any) => {
    const payload = ctx.req.json();
    return { status: "received", id: ctx.id, size: JSON.stringify(payload).length };
  });

// Start the server
app.listen(3000, () => {
  console.log("⚡ QHTTPX running on http://localhost:3000");
});
