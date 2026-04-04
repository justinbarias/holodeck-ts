# Getting Started with TypeScript

This is the main introduction section that provides an overview of TypeScript fundamentals and its purpose in modern development.

## Installation and Setup

To get started with TypeScript, you need to install it on your system. The installation process is straightforward and can be completed in just a few minutes.

Here's what you need to do:

1. Install Node.js if you haven't already
2. Open your terminal and run the package manager command
3. Verify the installation by checking the version

```typescript
// Example TypeScript code
function greet(name: string): string {
  return `Hello, ${name}!`;
}

const message = greet("World");
console.log(message);
```

## Core Concepts

TypeScript introduces several important concepts that enhance your JavaScript development experience. These features make your code more reliable and easier to maintain.

### Type System

The type system is one of the most powerful features of TypeScript. It allows you to define the shape of your data and catch errors before runtime. Types can be primitives like string and number, or complex objects with multiple properties.

Types help prevent bugs by ensuring that functions receive the correct arguments and that variables are used appropriately throughout your codebase.
