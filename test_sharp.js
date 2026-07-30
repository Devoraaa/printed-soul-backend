const sharp = require('sharp');
async function test() {
  const bg = await sharp({ create: { width: 100, height: 100, channels: 4, background: 'red' } }).png().toBuffer();
  const correctSvg = `<svg width="100" height="100">
    <mask id="myMask">
      <rect width="100" height="100" fill="white" rx="20"/>
      <rect x="20" y="20" width="40" height="40" fill="black" rx="10"/>
    </mask>
    <rect width="100" height="100" fill="white" mask="url(#myMask)" />
  </svg>`;

  const res = await sharp(bg).composite([{ input: Buffer.from(correctSvg), blend: 'dest-in' }]).png().toBuffer();
  require('fs').writeFileSync('test.png', res);
  console.log('done');
}
test();
