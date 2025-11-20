# Sigil Examples

This directory contains real-world schema examples demonstrating Sigil's capabilities across different application domains.

## 📦 Available Examples

### 1. Blog (Simple)
**Location:** `examples/migrations/`

A simple blog application with users, posts, comments, and tags.

**Features:**
- User authentication
- Post management with status
- Nested comments
- Tag system (many-to-many)
- Foreign key relationships

**Perfect for:** Learning Sigil basics, small content websites

---

### 2. E-Commerce Platform
**Location:** `examples/e-commerce/`

A complete online store schema with products, orders, reviews, and more.

**Migrations:**
- `01_core_schema.sigl` - Users, products, categories, orders, cart
- `02_reviews_and_wishlist.sigl` - Reviews, ratings, wishlists, coupons

**Features:**
- User accounts and addresses
- Product catalog with categories
- Shopping cart functionality
- Order management with status tracking
- Product reviews and ratings
- Wishlist system
- Discount coupons
- Inventory management

**Tables:** 20+ tables, 50+ indexes

**Perfect for:** E-commerce sites, marketplaces, retail systems

---

### 3. Multi-Tenant SaaS
**Location:** `examples/multi-tenant/`

A SaaS platform with tenant isolation and subscription management.

**Migrations:**
- `01_tenant_schema.sigl` - Complete multi-tenant architecture

**Features:**
- Tenant (organization) management
- Subscription and billing
- User roles per tenant
- Tenant invitations
- Projects and tasks (tenant-scoped)
- Activity audit log
- Tenant isolation with indexes

**Key Concepts:**
- Every table has `tenantId` for data isolation
- Composite indexes for tenant queries
- Soft deletes with tenant awareness

**Perfect for:** SaaS platforms, B2B applications, agency tools

---

### 4. Social Media Platform
**Location:** `examples/social-media/`

A Twitter/Instagram-like social network schema.

**Migrations:**
- `01_core_schema.sigl` - Complete social network

**Features:**
- User profiles with followers
- Posts with multiple media types
- Likes, reposts, replies
- Hashtags and trends
- Mentions and notifications
- Bookmarks with collections
- Direct messaging (1-on-1 and groups)
- Privacy controls

**Tables:** 15+ tables optimized for social interactions

**Perfect for:** Social networks, community platforms, forums

---

## 🎯 How to Use These Examples

### 1. Copy to Your Project

```bash
# Copy an example to your project
cp -r examples/e-commerce/* ./migrations/

# Or start fresh with one
sigil init
cp examples/e-commerce/01_core_schema.sigl migrations/
```

### 2. Customize for Your Needs

Each example is production-ready but can be customized:

```sigl
# Add custom fields
model User {
  id            Serial          @pk
  # ... existing fields ...
  customField   VarChar(100)    # Your addition
}
```

### 3. Apply Migrations

```bash
# Configure your database in sigil.config.js
# Then apply
sigil up
```

### 4. Generate for Different Databases

Sigil automatically generates the correct SQL for your database:

```javascript
// PostgreSQL
import { PostgresGenerator } from 'sigil';
generator: new PostgresGenerator()

// MySQL
import { MySQLGenerator } from 'sigil';
generator: new MySQLGenerator()

// SQLite
import { SQLiteGenerator } from 'sigil';
generator: new SQLiteGenerator()
```

---

## 📚 Schema Design Patterns

### Soft Deletes
```sigl
model User {
  # ... fields ...
  deletedAt  Timestamp  # NULL means not deleted
}
```

### Audit Trail
```sigl
model Product {
  # ... fields ...
  createdAt  Timestamp  @default(now)
  updatedAt  Timestamp
  createdBy  Int        @ref(User.id)
  updatedBy  Int        @ref(User.id)
}
```

### Polymorphic Relations (via type field)
```sigl
model Comment {
  id            Serial          @pk
  content       Text            @notnull
  commentableType VarChar(50)   @notnull  # 'Post', 'Photo', etc
  commentableId   Int           @notnull
  userId        Int             @ref(User.id)
}
```

### Self-Referencing (Nested Categories)
```sigl
model Category {
  id        Serial  @pk
  parentId  Int     @ref(Category.id) @onDelete('cascade')
  name      Text    @notnull
}
```

### Junction Tables (Many-to-Many)
```sigl
model Post {
  id    Serial  @pk
  title Text    @notnull
}

model Tag {
  id   Serial  @pk
  name Text    @notnull
}

model PostTag {
  id      Serial  @pk
  postId  Int     @ref(Post.id) @onDelete('cascade')
  tagId   Int     @ref(Tag.id) @onDelete('cascade')
}

> CREATE UNIQUE INDEX idx_post_tag_unique ON "PostTag"("postId", "tagId");
```

---

## 🔍 Index Strategies

### Basic Lookup
```sigl
> CREATE INDEX idx_users_email ON "User"("email");
```

### Foreign Keys
```sigl
> CREATE INDEX idx_posts_author ON "Post"("authorId");
```

### Composite (Multi-Column)
```sigl
> CREATE INDEX idx_orders_user_status ON "Order"("userId", "status");
```

### Unique Constraint
```sigl
> CREATE UNIQUE INDEX idx_username ON "User"("username");
```

### Covering Index (Performance)
```sigl
> CREATE INDEX idx_posts_lookup ON "Post"("userId", "status", "createdAt" DESC);
```

---

## 💡 Best Practices

1. **Always add indexes on foreign keys** - Improves JOIN performance
2. **Use ENUM for fixed sets** - Better than VARCHAR for status fields
3. **Add timestamps** - `createdAt` and `updatedAt` on every table
4. **Normalize when possible** - But denormalize for performance if needed
5. **Use ON DELETE CASCADE carefully** - Understand cascading deletes
6. **Add unique constraints** - Prevent duplicate data at DB level
7. **Consider soft deletes** - For data that might need recovery
8. **Use meaningful names** - `userId` not `user_id`, be consistent

---

## 🚀 Next Steps

- Explore the examples
- Adapt them to your use case
- Test with different database systems
- Check the main [Sigil README](../README.md) for more features

---

**Questions or improvements?** Open an issue or PR!
