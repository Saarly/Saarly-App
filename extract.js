const fs = require('fs');
const corrupted = JSON.parse(fs.readFileSync('corrupted.json', 'utf8'));
const englishStrings = new Set();
const otherStrings = [];

for (const file in corrupted) {
  for (const item of corrupted[file]) {
    const line = item.content;
    const enMatch1 = line.match(/en:\s*"([^"]+)"/);
    if (enMatch1) {
      englishStrings.add(enMatch1[1]);
      continue;
    }
    const ternaryMatch = line.match(/lang === "ar" \? "([^"]+)" \: "([^"]+)"/);
    if (ternaryMatch) {
      englishStrings.add(ternaryMatch[2]);
      continue;
    }
    const labelEnMatch = line.match(/label_en:\s*"([^"]+)"/);
    if (labelEnMatch) {
      englishStrings.add(labelEnMatch[1]);
      continue;
    }
    otherStrings.push(line);
  }
}

fs.writeFileSync('extracted.txt', Array.from(englishStrings).join('\n') + '\n\nOTHER:\n' + otherStrings.join('\n'));
console.log('Saved to extracted.txt');
