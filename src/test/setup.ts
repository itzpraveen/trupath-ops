// Modules under test import the database client, which only needs a URL to be constructed (it connects lazily).
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
