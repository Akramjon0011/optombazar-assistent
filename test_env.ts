import fs from 'fs';
console.log("Env keys:", Object.keys(process.env).filter(k => k.includes('GEMINI')));
