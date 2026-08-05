const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', '전국어린이보호구역표준데이터.csv');
const buf = fs.readFileSync(csvPath);
const dec = new TextDecoder('euc-kr');
const text = dec.decode(buf);

const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
const header = lines[0].split(',').map(s => s.trim());
console.log('Header:', header);

function parseCSVLine(text) {
  let result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

let records = [];
for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length < 8) continue;
  
  const type = row[0] || '기타';
  const name = row[1] || '미지정';
  const addrRoad = row[2] || '';
  const addrJibun = row[3] || '';
  const lat = parseFloat(row[4]);
  const lng = parseFloat(row[5]);
  const police = row[7] || '';
  const cctvExist = (row[8] || '').toUpperCase() === 'Y';
  const cctvCount = parseInt(row[9]) || 0;
  const rawWidth = row[10] || '';
  
  if (isNaN(lat) || isNaN(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;

  // Road width calculation
  let widthVal = parseFloat(rawWidth.replace(/[^0-9.]/g, '')) || 8;
  let roadWidthScore = 10;
  if (widthVal >= 12) roadWidthScore = 30;
  else if (widthVal >= 8) roadWidthScore = 20;

  // CCTV score
  let cctvExistScore = cctvExist ? 20 : 0;
  let cctvCountScore = Math.min(30, cctvCount * 10);
  let infraScore = police ? 20 : 10;

  let totalScore = Math.min(100, Math.max(0, cctvExistScore + cctvCountScore + roadWidthScore + infraScore));

  let grade = 5;
  let gradeText = '위험';
  let badgeColor = '#EF4444'; // Red
  let icon = '🎒';
  if (type.includes('초등학교')) icon = '🏫';
  else if (type.includes('유치원')) icon = '🐥';
  else if (type.includes('어린이집')) icon = '👶';

  if (totalScore >= 90) { grade = 1; gradeText = '매우 안전'; badgeColor = '#10B981'; }
  else if (totalScore >= 75) { grade = 2; gradeText = '안전'; badgeColor = '#34D399'; }
  else if (totalScore >= 60) { grade = 3; gradeText = '보통'; badgeColor = '#FBBF24'; }
  else if (totalScore >= 40) { grade = 4; gradeText = '주의'; badgeColor = '#F97316'; }

  records.push({
    id: i,
    type,
    name,
    address: addrRoad || addrJibun,
    lat,
    lng,
    cctvExist,
    cctvCount,
    roadWidth: widthVal,
    police,
    score: totalScore,
    grade,
    gradeText,
    badgeColor,
    icon
  });
}

console.log('Valid Parsed Records:', records.length);
if (records.length > 0) {
  console.log('Sample record:', records[0]);
}

const outDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(path.join(outDir, 'facilities.json'), JSON.stringify(records, null, 2));
fs.writeFileSync(path.join(outDir, 'facilities.js'), 'window.FACILITIES_DATA = ' + JSON.stringify(records) + ';');
console.log('Successfully written data/facilities.json and data/facilities.js');

