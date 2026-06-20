const https = require('https');

https.get('https://massapro.com', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const hexRegex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})\b/g;
    const colors = {};
    let match;
    while ((match = hexRegex.exec(data)) !== null) {
      const color = match[0].toLowerCase();
      colors[color] = (colors[color] || 0) + 1;
    }
    
    // Sort and print top colors
    const sorted = Object.entries(colors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
      
    console.log("Top Hex Colors:");
    sorted.forEach(([color, count]) => {
      console.log(`${color}: ${count} times`);
    });
  });
}).on('error', err => {
  console.log('Error: ' + err.message);
});
