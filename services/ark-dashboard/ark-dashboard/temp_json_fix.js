const fs = require('fs');

// Read the current file
let content = fs.readFileSync('app/(dashboard)/query/[id]/page.tsx', 'utf8');

// Replace the getJsonDisplay function with a better version
const newFunction = `const getJsonDisplay = () => {
      if (rawJson && typeof rawJson === 'object' && (rawJson as { raw?: string }).raw) {
        try {
          const parsed = JSON.parse((rawJson as { raw?: string }).raw!);
          // Create a more readable structure
          const readableJson = {
            content: rawJson.content || 'No content',
            target: rawJson.target || 'No target',
            conversation: parsed
          };
          return JSON.stringify(readableJson, null, 2);
        } catch {
          return JSON.stringify(rawJson, null, 2);
        }
      }
      return JSON.stringify(rawJson, null, 2);
    };`;

// Replace the function
content = content.replace(
  /const getJsonDisplay = \(\) => \{[\s\S]*?\};/,
  newFunction
);

// Write back to file
fs.writeFileSync('app/(dashboard)/query/[id]/page.tsx', content);
console.log('JSON display function updated successfully!');
