import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBuyerSegment } from './buyer-segments.mjs';

test('wholesale markets and retail are not import buyers', () => {
 for(const category of ['Chợ bán buôn nông sản','Chợ','Wholesale market','Chợ nông sản','Cửa hàng tạp phẩm','Cửa hàng tạp hóa nhập khẩu từ Mỹ'])
  assert.equal(classifyBuyerSegment({category}), 'market_retail', category);
});
test('wholesale and distribution are conditional channels, not import evidence', () => {
 for(const category of ['Cửa hàng bán buôn','Nhà bán buôn gạo','Dịch vụ phân phối','Wholesaler'])
  assert.equal(classifyBuyerSegment({category}), 'distribution', category);
});
test('only explicit source category signals import role, title and search never establish it', () => {
 assert.equal(classifyBuyerSegment({category:'Nhà nhập khẩu'}),'import_signal');
 assert.equal(classifyBuyerSegment({category:'Cửa hàng bán buôn',subcategories:['Nhà nhập khẩu']}),'import_signal');
 assert.equal(classifyBuyerSegment({category:'Company',title:'Coffee importer',query:'coffee importer'}),'other');
 assert.equal(classifyBuyerSegment({category:'Customs broker',subcategories:['Importer']}),'other');
 assert.equal(classifyBuyerSegment({category:'Nhà sản xuất'}),'manufacturing');
 assert.equal(classifyBuyerSegment({category:'Công ty'}),'other');
 assert.equal(classifyBuyerSegment({category:'',subcategories:[null,42]}),'other');
});

import { isImportCandidate } from './buyer-segments.mjs';
test('import candidate gate is role-based and industry-neutral', () => {
 const yes = [
  {category:'Nhà bán buôn cà phê'},{category:'Nhà nhập khẩu'},{category:'Công ty xuất nhập khẩu'},{category:'Textile wholesaler'},
  {category:'Machinery distributor'},{category:'Cơ sở rang cà phê'},{category:'Food processor'},{category:'Nhà sản xuất đồ nội thất'},
  {category:'Cửa hàng bán thực phẩm đặc sản',title:'SUL Portugal Import GmbH'},{category:'Văn phòng công ty',title:'ABC Trading Co'},
 ];
 const no = [
  {category:'Quán cà phê'},{category:'Coffee shop'},{category:'Nhà hàng'},{category:'Hotel'},{category:'Cửa hàng tạp phẩm Ấn Độ'},
  {category:'Cửa hàng bán thực phẩm đặc sản',title:'Adria Store'},{category:'Quán cà phê',title:'Import Cafe'},{category:'Customs broker',title:'Freight Co'},{category:'Văn phòng công ty',title:'Neumann Gruppe'},
 ];
 for (const r of yes) assert.equal(isImportCandidate(r), true, JSON.stringify(r));
 for (const r of no) assert.equal(isImportCandidate(r), false, JSON.stringify(r));
});
