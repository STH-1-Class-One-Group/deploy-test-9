// fetch_data.js
const API_KEY  = process.env.ROAD_API_KEY;
const API_BASE = 'https://data.ex.co.kr/openapi/locationinfo/locationinfoUnit';
const TARGET   = { "001":true, "010":true, "015":true, "035":true, "050":true };

async function main() {
  const pages = [1,2,3,4,5,6];
  const results = await Promise.all(pages.map(p =>
    fetch(`${API_BASE}?key=${API_KEY}&type=json&numOfRows=100&pageNo=${p}`)
      .then(r => r.json())
  ));

  const list = [];
  results.forEach(r => {
    if (r.list) r.list.forEach(d => {
      if (TARGET[d.routeNo]) list.push(d);
    });
  });

  const fs = await import('fs');
  fs.writeFileSync('data.json', JSON.stringify({ list }, null, 2));
  console.log('저장 완료:', list.length, '개');
}

main();