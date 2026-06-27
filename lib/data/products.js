// Catalogue product data — 127 items from the Malaya Jewellery catalogue.
// Names, sub-titles and images sourced from the live Malaya Jewelry catalogue.
// Real retail prices from the studio price sheet (Current USD column).

import { STOCK_BY_CODE, stockStatus } from './stock-data.js';
import { MATERIALS, STOCK_OPTIONS, detectMaterial } from './materials.js';


export const COLLECTIONS = [
  'Malaya Collection', 'Malaya Splendor', 'Healing Stones',
  'Ritual Objects', 'Heart Syllables', 'Mystical Beings',
];
export const CATEGORIES = [
  'Necklaces', 'Pendants', 'Earrings', 'Rings', 'Bracelets',
  'Bangles', 'Brooches', 'Cufflinks', 'Chains', 'Accessories',
];

// Re-export the canonical material taxonomy + stock states so existing importers
// (`@/lib/data/products`) keep working unchanged.
export { MATERIALS, STOCK_OPTIONS };
function collectionOf(name, sub) {
  const t = (name + ' ' + sub).toLowerCase();
  if (/\b(hri|om|ah|hung|tam|bam|dhi|dzam|syllable|mantra|tara)\b/.test(t)) return 'Heart Syllables';
  if (/(vajra|dorje|phurba|drigug|bell|melong|gau|chakra|mala|conch|banner|parasol|fish|knot|wheel|dharma)/.test(t)) return 'Ritual Objects';
  if (/(turquoise|coral|quartz|sapphire|ruby|onyx|agate|stone|poppy|petal|cabochon)/.test(t)) return 'Healing Stones';
  if (/(skull|dakini|deity|laughing|longevity|nyima|dawa)/.test(t)) return 'Mystical Beings';
  if (/diamond/.test(t)) return 'Malaya Splendor';
  return 'Malaya Collection';
}

const PRICE_MAP = {"p001":3205,"p002":185,"p003":2564,"p004":2836,"p005":1825,"p006":2564,"p007":1825,"p008":1825,"p009":468,"p010":271,"p011":271,"p012":395,"p013":321,"p014":1134,"p015":15904,"p016":1973,"p017":518,"p018":148,"p019":1332,"p020":234,"p021":468,"p022":173,"p023":2836,"p024":1332,"p025":1307,"p026":148,"p027":148,"p028":1381,"p029":197,"p030":2589,"p031":4241,"p032":567,"p033":395,"p034":1208,"p035":1159,"p036":1011,"p037":197,"p038":173,"p039":210,"p040":1282,"p041":148,"p042":641,"p043":5400,"p044":764,"p045":185,"p046":185,"p047":185,"p048":185,"p049":185,"p050":185,"p051":185,"p052":863,"p053":1800,"p054":1208,"p055":5400,"p056":937,"p057":912,"p058":1134,"p059":370,"p060":567,"p061":1800,"p062":1751,"p063":1800,"p064":863,"p065":444,"p066":912,"p067":345,"p068":1504,"p069":1048,"p070":1332,"p071":123,"p072":1751,"p073":1381,"p074":271,"p075":986,"p076":1775,"p077":3205,"p078":185,"p079":2959,"p080":2096,"p081":1208,"p082":1282,"p083":173,"p084":1085,"p085":1085,"p086":468,"p087":148,"p088":2589,"p089":173,"p090":1332,"p091":148,"p092":2244,"p093":345,"p094":4389,"p095":493,"p096":8260,"p097":493,"p098":468,"p099":3600,"p100":296,"p101":715,"p102":715,"p103":3156,"p104":284,"p105":2959,"p106":370,"p107":432,"p108":370,"p109":715,"p110":715,"p111":370,"p112":284,"p113":370,"p114":715,"p115":2786,"p116":6066,"p117":4389,"p118":321,"p119":173,"p120":185,"p121":173,"p122":641,"p123":148,"p124":2663,"p125":8285,"p126":8285,"p127":358};

export const CODE_MAP = {"p001":"E012-YGP","p002":"N024-S","p003":"R041-YG14-TQ","p004":"E023-YG14-TUR","p005":"E008-YG14-RR","p006":"R048-YG14-TQ-DIA-BT","p007":"R042-YG18-TQ-DIA","p008":"R042-YG18-TQ-DIA","p009":"R046-S-ON","p010":"B009-S-CHAIN","p011":"B008-S","p012":"E026-S","p013":"E012-YGP","p014":"P045-YGP","p015":"E056-YG18-BS-DIA","p016":"P051-WG18","p017":"P024-S","p018":"P041-CZ-S","p019":"P067-S","p020":"P067-S","p021":"E032-S-CZ","p022":"P061-S","p023":"P029-YG18","p024":"P068-YG14-TQ","p025":"E016-14K-TQ","p026":"P065-S","p027":"P052-S","p028":"P065-YG18","p029":"P055-S","p030":"P034-WG14-DIA","p031":"P066-YG14-SRB","p032":"P044-YGP","p033":"P064-YGP-CZ","p034":"P042-WG14-DIA","p035":"E014-YG14","p036":"P052-YG14","p037":"P060-YGP-R","p038":"P059-S-G","p039":"P058-S-B","p040":"P031F-YG14-DIA","p041":"P050-S","p042":"P005-S","p043":"P049-YG14","p044":"P050-YG14","p045":"P031G-S","p046":"P031D-S","p047":"P031E-S","p048":"P031H-S","p049":"P031C-S","p050":"P031A-S","p051":"P031B-S","p052":"P055-YG14","p053":"P034-RG14-DIA","p054":"P051-YG14","p055":"P005-YG14","p056":"P036-S","p057":"P021-YG18","p058":"P045-YGP","p059":"P041-CZ-S","p060":"P044-YGP","p061":"P034-RG14-DIA","p062":"P034-YG14-DIA","p063":"P034-WG14-DIA","p064":"E040-YG14-DIA","p065":"P026-S","p066":"P021-YG18","p067":"P038-S","p068":"N005B-YG14","p069":"P037-YG14","p070":"P012-YG14","p071":"P037-S","p072":"P034-YG14-DIA","p073":"P032-14K-MOP","p074":"E035-YGP-CZ","p075":"P028-YG14","p076":"P027-YG14","p077":"P030-YG18","p078":"P031F","p079":"P056-WG18-BS","p080":"P021-PT","p081":"P051-YG14","p082":"P021-WG14","p083":"P020-YG14","p084":"P020-YG14","p085":"P020-YG14","p086":"E006B-S","p087":"P020-S","p088":"P016-YG14","p089":"P018-RGP","p090":"P012-YG14","p091":"P035-S","p092":"N025-YG14-TQ-DIA","p093":"N002-S-CZ","p094":"N020-YG18-TQ","p095":"N004-S","p096":"R032-YG18-CO","p097":"N004-S","p098":"E018-S-BCZ","p099":"N016-YG18","p100":"N009B-S","p101":"E026-YGP","p102":"N007B-YGP","p103":"N005B-YG14","p104":"N002-YGP","p105":"N010-YG14","p106":"N009B-YGP","p107":"E032-S-CZ","p108":"N002-YGP","p109":"E035-YGP-CZ","p110":"N003-YGP","p111":"N002-YGP","p112":"N002-S","p113":"N002-YGP","p114":"E018-S-BCZ","p115":"E030-YG14","p116":"E056-YG18-BS-DIA","p117":"E016-14K-TQ","p118":"E035-YGP-CZ","p119":"E006B-S","p120":"E006-YGP","p121":"E006B-S","p122":"E026-YG14","p123":"CL005-S-CZ","p124":"E039-YG18-DIA","p125":"E045-YG18-COR","p126":"E045-YG18-COR","p127":"E042-S-ENAMEL"};

const RAW = [
  ['p001','Melong Pendant Silver','CZ Diamonds','638154903397581852M.jpg','new','Pendants',220],
  ['p002','OM AH HUNG Mantra','Silver Necklace','638472658222884798M.jpg','new','Necklaces',220],
  ['p003','Turquoise Cabochon, 18k','Diamond Gold Earrings','637805051901924769M.jpg','new','Earrings',178],
  ['p004','Flower Petal Turquoise','14K Gold Earrings','638088205231120654M.jpg','new','Earrings',168],
  ['p005','Double Dorje Stud Earring','Red Rubies 14K Gold','637165565495800866M.jpg','new','Earrings',12],
  ['p006','Intricate 14k Gold Ring','Turquoise & Diamonds','638346206038471345M.jpg','new','Rings',38],
  ['p007','Ratna Turquoise Ring','18k Gold, Diamonds','638209687858611875M.jpeg','new','Rings',178],
  ['p008','Turquoise Tranquility','18K Yellow Gold Ring','638088203267101306M.jpg','new','Rings',188],
  ['p009','The Dharma Wheel Ring','Silver, Black Onyx','638078327981128612M.jpg','new','Rings',270],
  ['p010','Vajra Chain Bracelet','Silver, Large','638221205459508005M.jpg','new','Bracelets',220],
  ['p011','Continuous Vajra Bracelet','Silver, Smaller Size','638088339763291770M.jpg','new','Bracelets',232],
  ['p012','Malaya Logo Necklace','Silver','638472671154483242M.jpg','new','Necklaces',248],
  ['p013','Melong Earrings','Gold Plated','637160742807503286M.jpg','sale','Earrings',48],
  ['p014','Tara Mantra Agate Pendant','Silver','638742270931040469M.jpg',null,'Pendants',158],
  ['p015','Long Life Vase Locket','18k Gold, Sapphires','638606856520992462M.jpg',null,'Pendants',222],
  ['p016','Endless Knot Pendant','Small White Gold 18k','638555845817145953M.jpg',null,'Pendants',38],
  ['p017','Vajra Pendant Mid Size','Silver, With Chain','638512392394427383M.jpg',null,'Pendants',218],
  ['p018','Hung Syllable Pendant','Silver, CZ Diamonds','638411553833027599M.jpg',null,'Pendants',256],
  ['p019','Intricate Turquoise','14K Gold Diamond Pendant','638346209007364089M.jpg',null,'Pendants',178],
  ['p020','"Ratna" Blue Quartz','Silver Pendant','638193583862721893M.jpg',null,'Pendants',220],
  ['p021','Endless Knot 3D Pendant','Silver, CZ, With Chain','638192675590790469M.jpg',null,'Pendants',220],
  ['p022','Hri Syllable Pendant','Silver','638192669740154094M.jpg',null,'Pendants',232],
  ['p023','Vajra Pendant, Small','18K Yellow Gold','638115010268844501M.jpg',null,'Pendants',42],
  ['p024','Oval Pendant Turquoise','Yellow 14k Gold, Diamonds','638135149720371832M.jpg',null,'Pendants',178],
  ['p025','Bumpa Pendant Turquoise','14K Yellow Gold, Diamonds','638088247224091500M.jpg',null,'Pendants',178],
  ['p026','Om Syllable Pendant','Frameless, Silver','638025478972854961M.jpg',null,'Pendants',232],
  ['p027','Bam Syllable Pendant','Silver, With Chain','637955106113062766M.jpg',null,'Pendants',220],
  ['p028','Om Syllable Pendant','Yellow 18k Gold','637955089861320079M.jpg',null,'Pendants',42],
  ['p029','Double Dorje Pendant','Silver CZ','637949004508846641M.jpg',null,'Pendants',220],
  ['p030','Hung Pendant Small','White 14k Gold, Diamonds','637902378986609616M.jpg',null,'Pendants',220],
  ['p031','Longevity Vase Pendant','14K Gold, Ruby, Openable','637895126294897013M.jpg',null,'Pendants',12],
  ['p032','Deity Gau Pendant','Gold Plated, Chenrezig','637796593114081025M.jpg',null,'Pendants',44],
  ['p033','Double Vajra Medallion','Vermeil Gold, CZ Diamonds','637755750143846313M.jpeg',null,'Pendants',46],
  ['p034','Tam Syllable Pendant','White Gold 14k, Diamonds','637746154110927262M.jpg',null,'Pendants',200],
  ['p035','Tam Syllable Pendant','Yellow Gold 14k, Diamonds','637895150926827742M.jpg',null,'Pendants',38],
  ['p036','Bam Syllable Pendant','14K Yellow Gold','637719185223044388M.jpg',null,'Pendants',44],
  ['p037','Bam Syllable Pendant','Vermeil Gold, Enamel','637697784478494920M.jpg',null,'Pendants',50],
  ['p038','Tam Syllable Pendant','Silver, Green Enamel','637697783403552653M.jpg',null,'Pendants',158],
  ['p039','Hung Syllable Pendant','Silver, Blue Enamel','637697782329801496M.jpg',null,'Pendants',230],
  ['p040','Single Auspicious Banner','Pendant, Gold, Diamonds','637683000342205396M.jpg',null,'Pendants',44],
  ['p041','Drigug Pendant Small','Silver','637680404320532117M.jpg',null,'Pendants',220],
  ['p042','Phurba Pendant Small','Silver','637680403024864767M.jpg',null,'Pendants',232],
  ['p043','Phurba Micro Pendant','Solid 14k Yellow Gold','637680373376979682M.jpg',null,'Pendants',44],
  ['p044','Dakini Knife "Drigug"','Pendant, 14K Yellow Gold','637937474098891225M.jpg',null,'Pendants',42],
  ['p045','Single Auspicious Victory','Banner Pendant','637587009889899672M.jpg',null,'Pendants',46],
  ['p046','Single Auspicious Lotus','Pendant','637587008774081163M.jpg',null,'Pendants',44],
  ['p047','Single Auspicious Conch','Pendant','637587007506206287M.jpg',null,'Pendants',46],
  ['p048','Single Auspicious Dharma','Chakra Pendant','637587006289079444M.jpg',null,'Pendants',44],
  ['p049','Single Auspicious Vase','Pendant','637587004610677855M.jpg',null,'Pendants',44],
  ['p050','Single Auspicious Parasol','Pendant','637587003177139218M.jpg',null,'Pendants',46],
  ['p051','Single Auspicious Gold','Pair of Fish Pendant','637587001762769752M.jpg',null,'Pendants',44],
  ['p052','Double Dorje Pendant','14K Gold, Diamond','637588155818554132M.jpeg',null,'Pendants',44],
  ['p053','Endless Knot Pendant','Small, 14K Rose Gold','637556295127760436M.jpg',null,'Pendants',20],
  ['p054','Endless Knot Pendant','Small, 14K Yellow Gold','637556857967945539M.jpg',null,'Pendants',44],
  ['p055','Phurba Pendant Medium','14k Solid Gold','637714177546123423M.jpg',null,'Pendants',42],
  ['p056','Deity Gau Pendant','Silver, Sapphire','638808980368397414M.jpg',null,'Pendants',220],
  ['p057','Hung Syllable Pendant','Large, Diamonds 18K','637352139877916545M.jpg',null,'Pendants',222],
  ['p058','Tara Mantra Agate Pendant','Vermeil Gold','637853527478274269M.jpeg',null,'Pendants',158],
  ['p059','Tam Syllable Pendant Big','Silver, CZ Diamonds','637337797030044934M.jpg',null,'Pendants',218],
  ['p060','Gau Locket, Hung/Tsipatta','Vermeil Gold','637337746612984001M.jpg',null,'Pendants',46],
  ['p061','Endless Knot Pendant','14K Rose Gold & Diamonds','637227591612253488M.jpeg',null,'Pendants',20],
  ['p062','Endless Knot Pendant','14K Gold & Diamonds','637227578000616619M.jpeg',null,'Pendants',44],
  ['p063','Endless Knot Pendant','White 14K Gold & Diamonds','637227583875588051M.jpeg',null,'Pendants',200],
  ['p064','Clover Double Dorje','14k Diamonds Pendant','637333992495626561M.jpg',null,'Pendants',44],
  ['p065','Bell Pendant','Silver','637517322728212146M.jpg',null,'Pendants',220],
  ['p066','Small Hung Syllable','Pendant 18k Yellow Gold','637323087572372768M.jpeg',null,'Pendants',42],
  ['p067','Dogtag Pendant, Silver','Tashi Mannox Design','637259746373659011M.jpg',null,'Pendants',270],
  ['p068','Vajra Pendant Medium','14K Gold, Diamonds','637328965725964008M.jpg',null,'Pendants',44],
  ['p069','Ah Syllable Pendant','14K Yellow Gold','637204480963779846M.jpeg',null,'Pendants',42],
  ['p070','Tam Syllable Pendant','14K Yellow Gold','637227574162242679M.jpeg',null,'Pendants',44],
  ['p071','Ah Syllable Pendant','Silver','637204870922541081M.jpeg',null,'Pendants',220],
  ['p072','Single Auspicious Endless','Knot Pendant 14K Gold, Diamonds','637098003203701092M.jpg',null,'Pendants',44],
  ['p073','Laughing Skull Pendant','Gold & Mother of Pearl','637097981242925759M.jpg',null,'Pendants',44],
  ['p074','Bell Pendant, Large','Vermeil Gold','637034459885060932M.jpeg',null,'Pendants',46],
  ['p075','Bell Pendant, Small','14K Yellow Gold','637034461949621737M.jpeg',null,'Pendants',44],
  ['p076','Vajra Pendant, Mid Size','14K Yellow Gold','637034463248253210M.jpeg',null,'Pendants',44],
  ['p077','18k Yellow Gold Melong','Pendant with 12 Diamonds','637328974648643307M.jpg',null,'Pendants',42],
  ['p078','Single Auspicious Endless','Knot Pendant, Gold Plated','637034467075662233M.jpeg',null,'Pendants',46],
  ['p079','Hung Syllable 18K White','Gold Sapphire Pendant','637031026370200873M.jpeg',null,'Pendants',222],
  ['p080','Hung Syllable','Platinum Pendant','637031021887027308M.jpeg',null,'Pendants',220],
  ['p081','Endless Knot','14K Yellow Gold Pendant','636991059768206903M.jpeg',null,'Pendants',44],
  ['p082','Hung Syllable Small','14K White Gold Pendant','636991020374610258M.jpeg',null,'Pendants',200],
  ['p083','Hung Syllable','Rose 14K Gold Pendant','636990993143770915M.jpeg',null,'Pendants',20],
  ['p084','Hung Syllable Pendant','14K Yellow Gold, Small','636990964739728346M.jpeg',null,'Pendants',44],
  ['p085','Hung Syllable Pendant','14K Yellow Gold, Big','636990952879115858M.jpeg',null,'Pendants',42],
  ['p086','Endless Knot Pendant','Silver','637976754519608076M.jpg',null,'Pendants',220],
  ['p087','Hung Syllable Pendant','Silver, Large','636991029440964619M.jpeg',null,'Pendants',232],
  ['p088','Om Syllable Pendant','White Gold, Diamonds','636893327450528303M.jpg',null,'Pendants',200],
  ['p089','Hri Syllable Vermeil Gold','Love Charm Pendant','636878559921120361M.jpg',null,'Pendants',46],
  ['p090','Tam Syllable Pendant','14K Yellow Gold','636990975487968272M.jpeg',null,'Pendants',44],
  ['p091','Tam Syllable Pendant','Silver','637204726132505537M.jpeg',null,'Pendants',220],
  ['p092','Oval Turquoise Necklace','14k Gold, Diamonds','638358212113646715M.jpg',null,'Necklaces',178],
  ['p093','Tara Mantra Necklace','Silver, CZ Diamonds','638353611374052590M.jpg',null,'Necklaces',220],
  ['p094','"Turquoise Lake" Necklace','18K Gold, Diamonds','638088206288395185M.jpg',null,'Necklaces',178],
  ['p095','Vajra Necklace Small','5 Pronged, Silver','637955097565959862M.jpg',null,'Necklaces',220],
  ['p096','Round Coral Necklace','18k Gold, Diamonds','637895162721792345M.jpg',null,'Necklaces',12],
  ['p097','Vajra Necklace Medium','5 Pronged, Silver','637737777790131749M.jpg',null,'Necklaces',232],
  ['p098','Vajra Necklace 5 Pronged','Silver, Black Diamonds','637698734045248373M.jpg',null,'Necklaces',220],
  ['p099','Vajra Necklace Medium','Flat, 18K Yellow Gold','637684747492097470M.jpg',null,'Necklaces',42],
  ['p100','Mani Mantra Necklace','Silver','637823399327389979M.jpg',null,'Necklaces',220],
  ['p101','Malaya Layered Necklace','Vermeil Gold, CZ Diamonds','637658948250983083M.jpg',null,'Necklaces',46],
  ['p102','Vajra Guru Mantra Smaller','Necklace, Vermeil Gold','637517279809542898M.jpeg',null,'Necklaces',46],
  ['p103','Mid Vajra Necklace 14K','With Diamonds, 5 Pronged','637698595735562540M.jpg',null,'Necklaces',44],
  ['p104','Tara Mantra Necklace','18 Yellow Gold','637455607015972417M.jpg',null,'Necklaces',42],
  ['p105','Endless Knot Necklace','14K Yellow Gold, Diamonds','637384246188359632M.jpg',null,'Necklaces',44],
  ['p106','Mani Mantra Necklace','Gold Plated CZ, Small','637916738733666237M.jpeg',null,'Necklaces',48],
  ['p107','Endless Knot Necklace','Silver CZ','637336756894375956M.jpg',null,'Necklaces',220],
  ['p108','Dzambala Mantra Necklace','Gold Plated, CZ','637336747023919241M.jpg',null,'Necklaces',48],
  ['p109','Vajra Guru Necklace','Vermeil Gold, CZ, Large','637259778058727897M.jpg',null,'Necklaces',46],
  ['p110','Eight Auspicious Signs','Necklace','637518291359578709M.jpg',null,'Necklaces',200],
  ['p111','Tara Mantra CZ','Gold Plated Necklace','637037938304492964M.jpeg',null,'Necklaces',48],
  ['p112','Tara Mantra','Necklace Silver','636921119928125768M.jpeg',null,'Necklaces',220],
  ['p113','Tara Mantra','Gold Plated Necklace','636894484372523647M.jpg',null,'Necklaces',48],
  ['p114','Bell Earrings, 5 Prongs','Silver, Black Diamonds','638628910073308255M.jpg',null,'Earrings',220],
  ['p115','Endless Knot Hoop Earring','14K Yellow Gold, 23mm','638606895647442980M.jpg',null,'Earrings',44],
  ['p116','Bumpa Earrings 18k Gold','Diamonds & Sapphires','638378704467444223M.jpeg',null,'Earrings',42],
  ['p117','Intricate Turquoise Gold','Earrings with Diamonds','638358206100897522M.jpg',null,'Earrings',178],
  ['p118','Endless Knot Earrings','Vermeil Gold, Large','638332121157931319M.jpg',null,'Earrings',46],
  ['p119','Endless Knot Earrings','Large, Silver','638332117649997306M.jpg',null,'Earrings',220],
  ['p120','Ratna Quartz Earrings','Gold Plated','638325859341377378M.jpeg',null,'Earrings',48],
  ['p121','Endless Knot Earrings','Hanging, Silver','638088364416288531M.jpg',null,'Earrings',232],
  ['p122','Malaya Earrings','14K Gold, Diamonds','638078332859954597M.jpg',null,'Earrings',44],
  ['p123','Double Dorje Earrings','Silver, CZ Diamonds','637955108064512028M.jpg',null,'Earrings',220],
  ['p124','Endless Knot Earrings','Yellow 18k Gold, Diamonds','637938696458402811M.jpg',null,'Earrings',42],
  ['p125','Coral Oval Earrings','Yellow Gold, Diamonds','637899989692598544M.jpeg',null,'Earrings',12],
  ['p126','Round Coral Earrings','Diamonds, 18k Gold','637895143757537134M.jpg',null,'Earrings',12],
  ['p127','Blue Poppy Earrings','Silver, Sapphire','637895069995165892M.jpg',null,'Earrings',220],
];

export const PRODUCTS = RAW.map(([id, name, sub, file, tag, category, hue]) => {
  const material = detectMaterial(name + ' ' + sub, '14k Yellow Gold');
  const code = CODE_MAP[id] || id.toUpperCase();
  const stockRow = STOCK_BY_CODE[code] || null;
  const base = {
    name, sub, category, material,
    collection: collectionOf(name, sub),
    listPrice: (stockRow && stockRow.retail != null) ? Math.round(stockRow.retail) : PRICE_MAP[id],
    salePrice: null,
    stock: stockRow ? stockStatus(stockRow.qty) : 'In stock',
    tag: tag || null,
    salesCode: code,
    productionCode: code.split('-')[0],
    qty: stockRow ? stockRow.qty : null,
    unitCost: stockRow ? stockRow.cost : null,
    inStock: !!stockRow,
  };
  const listPrice = Number(base.listPrice) || PRICE_MAP[id];
  return {
    id, hue, code,
    // Photos are Firebase-hosted and supplied per item via catalogueOverrides
    // (admin uploads). No built-in CDN image; unset ⇒ monogram placeholder.
    img: null,
    salesCode: base.salesCode,
    productionCode: base.productionCode,
    qty: base.qty,
    unitCost: base.unitCost,
    inStock: base.inStock,
    name: base.name, sub: base.sub, category: base.category, material: base.material,
    collection: base.collection, stock: base.stock,
    listPrice, salePrice: null, onSale: false, price: listPrice,
    tag: base.tag,
    base,
  };
});

export function fmtPrice(n) { return '$' + n.toLocaleString('en-US'); }

export function applyFilters(products, { collections = [], categories = [], materials = [], sort = 'featured', search = '' }) {
  let out = products.slice();
  if (collections.length) out = out.filter((p) => collections.includes(p.collection));
  if (categories.length) out = out.filter((p) => categories.includes(p.category));
  if (materials.length) out = out.filter((p) => materials.includes(p.material));
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((p) => p.name.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
  }
  switch (sort) {
    case 'new': out.sort((a, b) => (b.tag === 'new') - (a.tag === 'new')); break;
    case 'price-asc': out.sort((a, b) => a.price - b.price); break;
    case 'price-desc': out.sort((a, b) => b.price - a.price); break;
    case 'name': out.sort((a, b) => a.name.localeCompare(b.name)); break;
  }
  return out;
}
