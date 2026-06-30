const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ID = 'catitem-23e56738-2cc5-47de-a2bf-7992a209f7ae';

async function main() {
  const get = await fetch(`${COUCH}/bbddsaas-catalog/${ID}`, { headers: { Authorization: AUTH } });
  const doc = await get.json();
  doc.customFields = { ...(doc.customFields || {}), ingredients: 'Beyond, Queso vegano' };
  doc.updatedAt = new Date().toISOString();
  const put = await fetch(`${COUCH}/bbddsaas-catalog/${ID}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  console.log(await put.json());
}

main();
