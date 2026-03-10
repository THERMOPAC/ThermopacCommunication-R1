import { Router, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

const router = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

const SCORING_WEIGHTS = {
  feedstock_access: 25,
  capital_capability: 20,
  strategic_fit: 20,
  project_signal_strength: 20,
  geography: 10,
  contactability: 5,
};

const COMPANY_TYPES = [
  'used_oil_collector', 'waste_oil_recycler', 're_refiner', 'waste_management_company',
  'lubricant_company', 'base_oil_company', 'industrial_recycler', 'hazardous_waste_company',
  'trader_only', 'not_relevant', 'unclear'
] as const;

const PROJECT_TYPES = [
  'tender', 'permit_stage', 'expansion', 'new_plant', 'upgrade_modernization',
  'investment_signal', 'partnership_signal', 'weak_signal'
] as const;

const CONTACT_TYPES = [
  'generic', 'sales', 'projects', 'procurement', 'management', 'technical', 'plant', 'unknown'
] as const;

const MULTILINGUAL_QUERIES: Record<string, Record<string, string[]>> = {
  en: {
    company_discovery: [
      'used oil recycling company',
      'waste oil recycling plant',
      'used oil collector',
      're-refined base oil company',
      'waste oil processing facility',
      'used motor oil recycling service',
      'waste lubricating oil collection company',
    ],
    recycler_discovery: [
      'waste oil re-refinery',
      'used oil re-refining plant',
      'waste oil to base oil facility',
      'used oil regeneration re-processing company',
      'waste lubricant oil re-processing plant',
      'used engine oil recycling plant',
      'waste oil to base oil re-refining',
    ],
    base_oil_sellers: [
      'recycled base oil supplier',
      're-refined base oil for sale',
      'reclaimed base oil manufacturer',
      'regenerated base oil producer',
      'recycled lubricant base oil seller',
      'base oil from recycled lubricant',
    ],
    regulatory_docs: [
      'safety data sheet re-refined base oil SDS',
      'technical data sheet recycled base oil TDS',
      'environmental permit waste oil recycling facility',
      'hazardous waste license used oil processing',
      'waste oil recycler environmental compliance certificate',
      'used oil collection permit hazardous waste',
      'base oil re-refining facility regulatory filing',
      'waste oil treatment plant operating license',
    ],
    trade_flow: [
      'import waste oil HS 2710.91 customs data',
      'export re-refined base oil HS 2710.19 shipment',
      'import used lubricating oil HS 271099 importer',
      'export recycled base oil trade data',
      'waste oil importer exporter customs records',
      'used lubricant oil import export company',
      're-refined base oil export shipment data',
      'waste petroleum oil HS 2710 trade flow',
    ],
    tradeshow_discovery: [
      'IFAT exhibitor waste oil recycling base oil',
      'Ecomondo exhibitor list oil recycling regeneration',
      'Pollutec exhibitor directory waste oil treatment',
      'UNITI mineral oil technology congress exhibitor',
      'ICIS world base oils conference exhibitor list',
      'Lubricant Expo exhibitor base oil re-refining',
      'ADIPEC exhibitor waste oil recycling company',
      'base oil conference exhibitor directory lubricant recycling',
    ],
    directory_mining: [
      'geir-rerefining.org members',
      'used oil re-refining industry association members list',
      'waste oil recycling companies list directory',
      'licensed waste oil recyclers companies registry',
      'oil recycling association member companies',
      'base oil producers members directory association',
      'hazardous waste oil handlers licensed facilities list',
      'environmental agency waste oil carrier broker register',
    ],
    project_signal: [
      'waste oil recycling tender',
      'oil recycling plant construction',
      'waste oil recycling permit',
      'oil regeneration plant expansion',
      'circular economy waste oil project',
      'used oil re-refinery investment',
      'waste oil processing license application',
      'new base oil re-refining plant announced',
      'used oil recycling environmental permit',
      'oil re-refining capacity expansion project',
    ],
    regulatory_registry: [
      'licensed waste oil collectors register',
      'waste oil permit holders list',
      'hazardous waste transporter register waste oil',
      'authorized waste oil recyclers government registry',
      'registered waste oil carriers brokers dealers',
      'environmental agency waste oil licensed operators',
      'approved waste oil treatment facilities list',
      'waste oil collection license holders directory',
    ],
  },
  es: {
    company_discovery: [
      'empresa reciclaje aceite usado',
      'planta reciclaje aceite usado',
      'recolección aceite usado',
      'aceite base re-refinado',
      'procesamiento aceite residual',
    ],
    recycler_discovery: [
      'reciclador aceite residual',
      'regeneración aceite usado',
      'regeneración lubricantes',
      'planta re-refinación aceite',
      'tratamiento aceite peligroso',
    ],
    base_oil_sellers: [
      'proveedor aceite base reciclado',
      'aceite base re-refinado venta',
      'fabricante aceite base regenerado',
      'productor aceite base reciclado',
    ],
    regulatory_docs: [
      'hoja de seguridad aceite base re-refinado SDS',
      'ficha técnica aceite base reciclado',
      'permiso ambiental planta reciclaje aceite usado',
      'licencia residuos peligrosos aceite usado',
      'autorización gestión aceite usado residuo peligroso',
      'registro gestor residuos aceite lubricante usado',
    ],
    trade_flow: [
      'importador aceite usado HS 2710 datos aduanas',
      'exportador aceite base reciclado comercio',
      'importación aceite lubricante usado empresa',
      'exportación aceite base re-refinado datos comerciales',
      'empresa importadora exportadora aceite residual',
    ],
    tradeshow_discovery: [
      'IFAT expositor reciclaje aceite usado',
      'Ecomondo expositor regeneración aceite',
      'feria reciclaje aceite expositor base oil',
      'congreso aceite base lubricante expositor',
    ],
    directory_mining: [
      'directorio empresas reciclaje aceite usado',
      'lista recicladores aceite lubricante autorizados',
      'asociación empresas regeneración aceite miembros',
      'registro gestores aceite usado lista',
    ],
    project_signal: [
      'licitación reciclaje aceite usado',
      'construcción planta reciclaje aceite',
      'permiso reciclaje aceite residual',
      'inversión planta re-refinación aceite',
      'licencia ambiental reciclaje aceite usado',
      'ampliación capacidad re-refinación aceite',
      'nueva planta aceite base re-refinado',
    ],
    regulatory_registry: [
      'registro gestores autorizados aceite usado',
      'lista operadores autorizados residuos aceite',
      'registro transportistas residuos peligrosos aceite',
      'empresas autorizadas recolección aceite usado registro',
    ],
  },
  pt: {
    company_discovery: [
      'empresa reciclagem óleo usado',
      'planta reciclagem óleo usado',
      'coleta óleo usado',
      'óleo base re-refinado',
      'processamento óleo residual',
    ],
    recycler_discovery: [
      'reciclador óleo residual',
      'regeneração óleo usado',
      'regeneração lubrificantes',
      'planta re-refino óleo',
    ],
    base_oil_sellers: [
      'fornecedor óleo base reciclado',
      'óleo base re-refinado venda',
      'fabricante óleo base regenerado',
      'produtor óleo base reciclado',
    ],
    regulatory_docs: [
      'FISPQ óleo base re-refinado ficha segurança',
      'ficha técnica óleo base reciclado',
      'licença ambiental planta re-refino óleo usado',
      'autorização IBAMA coleta óleo lubrificante usado',
      'certificado CONAMA rerrefino óleo lubrificante',
      'alvará funcionamento reciclagem óleo usado',
      'cadastro técnico federal IBAMA óleo usado',
      'licença operação unidade rerrefino',
    ],
    trade_flow: [
      'importador óleo usado HS 2710 dados alfândega',
      'exportador óleo base reciclado comércio exterior',
      'importação óleo lubrificante usado empresa',
      'exportação óleo base re-refinado dados comerciais',
      'empresa importadora exportadora óleo residual',
      'balança comercial óleo usado re-refinado',
    ],
    tradeshow_discovery: [
      'IFAT expositor reciclagem óleo usado',
      'Ecomondo expositor regeneração óleo',
      'feira reciclagem óleo expositor base oil',
      'congresso óleo base lubrificante expositor',
    ],
    directory_mining: [
      'diretório empresas reciclagem óleo usado',
      'lista rerefinadores óleo lubrificante autorizados',
      'associação empresas rerrefino óleo membros',
      'cadastro coletores óleo usado lista IBAMA',
    ],
    project_signal: [
      'licitação reciclagem óleo usado',
      'construção planta reciclagem óleo',
      'licença ambiental re-refino óleo',
      'investimento planta re-refino óleo lubrificante',
      'nova planta óleo base re-refinado',
      'ampliação capacidade re-refino óleo usado',
      'projeto reciclagem óleo lubrificante usado',
      'edital licitação coleta óleo usado',
    ],
    regulatory_registry: [
      'registro coletores óleo usado autorizados IBAMA',
      'lista empresas licenciadas rerrefino óleo usado',
      'cadastro transportadores resíduos perigosos óleo',
      'empresas autorizadas coleta óleo usado registro estadual',
    ],
  },
  de: {
    company_discovery: [
      'Altöl Recycling Unternehmen',
      'Altöl Aufbereitung Anlage',
      'Altöl Sammlung',
      'Basisöl Aufbereitung',
      'Altöl Verarbeitung',
    ],
    recycler_discovery: [
      'Altöl Recycler',
      'Altöl Regeneration',
      'Schmierstoff Regeneration',
      'Altöl Raffinerie',
    ],
    base_oil_sellers: [
      'recyceltes Grundöl Lieferant',
      're-raffiniertes Grundöl kaufen',
      'regeneriertes Basisöl Hersteller',
    ],
    regulatory_docs: [
      'Sicherheitsdatenblatt Altöl re-raffiniertes Grundöl',
      'technisches Datenblatt regeneriertes Basisöl',
      'Genehmigung Altöl Aufbereitung Anlage',
      'Abfallentsorgungslizenz Altöl Verarbeitung',
      'BImSchG Genehmigung Altöl Recycling',
      'Entsorgungsfachbetrieb Altöl Zertifikat',
    ],
    trade_flow: [
      'Importeur Altöl HS 2710 Zolldaten',
      'Exporteur regeneriertes Grundöl Handelsdaten',
      'Import Altöl Schmierstoff Unternehmen',
      'Export recyceltes Basisöl Außenhandel',
    ],
    tradeshow_discovery: [
      'IFAT Aussteller Altöl Recycling',
      'UNITI Mineralöltechnik Kongress Aussteller',
      'Ecomondo Aussteller Ölregeneration',
      'Messe Altöl Aufbereitung Ausstellerliste',
    ],
    directory_mining: [
      'Verzeichnis Altöl Recycling Unternehmen Liste',
      'Altöl Aufbereiter zugelassene Betriebe Liste',
      'Verband Altöl Regeneration Mitglieder',
      'Entsorgungsfachbetriebe Altöl Liste Verzeichnis',
    ],
    project_signal: [
      'Altöl Recycling Ausschreibung',
      'Altöl Anlage Genehmigung',
      'Investition Altöl Aufbereitung Anlage',
      'Umweltgenehmigung Altöl Recycling',
      'neue Altöl Raffinerie Bau',
      'Kapazitätserweiterung Altöl Regeneration',
    ],
    regulatory_registry: [
      'zugelassene Altöl Sammler Register Liste',
      'Entsorgungsfachbetrieb Altöl zugelassene Betriebe',
      'Genehmigung Altöl Transporter Register',
      'Abfallwirtschaft Altöl lizenzierte Betriebe Liste',
    ],
  },
  fr: {
    company_discovery: [
      'entreprise recyclage huile usagée',
      'installation recyclage huile usagée',
      'collecte huile usagée',
      'huile de base re-raffinée',
      'traitement huile usagée',
    ],
    recycler_discovery: [
      'recycleur huile usagée',
      'régénération huile usagée',
      'régénération lubrifiants',
    ],
    base_oil_sellers: [
      'fournisseur huile de base recyclée',
      'huile de base re-raffinée vente',
      'fabricant huile de base régénérée',
    ],
    regulatory_docs: [
      'fiche de données sécurité huile base régénérée FDS',
      'fiche technique huile base re-raffinée',
      'autorisation ICPE installation recyclage huile usagée',
      'agrément préfectoral collecte huile usagée',
      'déclaration ICPE traitement huile usagée',
      'certificat conformité recyclage huile usagée',
    ],
    trade_flow: [
      'importateur huile usagée HS 2710 données douanes',
      'exportateur huile base régénérée commerce',
      'importation huile lubrifiant usagée entreprise',
      'exportation huile base recyclée données commerciales',
    ],
    tradeshow_discovery: [
      'Pollutec exposant recyclage huile usagée',
      'IFAT exposant traitement huile usagée',
      'salon recyclage huile exposant liste',
      'congrès huile base lubrifiants exposant',
    ],
    directory_mining: [
      'annuaire entreprises recyclage huile usagée France',
      'liste régénérateurs huile usagée agréés',
      'syndicat professionnel recyclage huile membres',
      'collecteurs huile usagée agréés liste préfecture',
    ],
    project_signal: [
      'appel offre recyclage huile usagée',
      'permis recyclage huile usagée',
      'investissement usine re-raffinage huile',
      'autorisation environnementale recyclage huile',
      'construction usine régénération huile usagée',
      'projet nouvelle usine huile de base',
    ],
    regulatory_registry: [
      'collecteurs agréés huile usagée liste préfecture',
      'opérateurs autorisés traitement huile usagée registre',
      'transporteurs agréés déchets dangereux huile registre',
      'installations classées ICPE huile usagée liste',
    ],
  },
  tr: {
    company_discovery: [
      'atık yağ geri dönüşüm şirketi',
      'atık yağ geri kazanım tesisi',
      'atık yağ toplama',
      'baz yağ geri kazanım',
      'atık yağ işleme',
    ],
    recycler_discovery: [
      'atık yağ geri dönüşüm',
      'atık yağ rejenerasyon',
      'madeni yağ geri kazanım',
    ],
    base_oil_sellers: [
      'geri dönüştürülmüş baz yağ tedarikçisi',
      're-rafine baz yağ satış',
      'rejenerasyonlu baz yağ üretici',
    ],
    regulatory_docs: [
      'güvenlik bilgi formu baz yağ re-rafine SDS',
      'teknik veri sayfası geri dönüştürülmüş baz yağ',
      'çevre izin belgesi atık yağ geri dönüşüm tesisi',
      'tehlikeli atık lisansı atık yağ işleme',
      'atık yağ toplama izin belgesi',
      'çevre bakanlığı atık yağ lisansı',
    ],
    trade_flow: [
      'atık yağ ithalatçı HS 2710 gümrük verileri',
      'rejenerasyonlu baz yağ ihracatçı ticaret',
      'atık madeni yağ ithalat ihracat şirketi',
      'geri dönüştürülmüş baz yağ ihracat verileri',
    ],
    tradeshow_discovery: [
      'IFAT katılımcı atık yağ geri dönüşüm',
      'ADIPEC katılımcı yağ geri kazanım',
      'fuar atık yağ geri dönüşüm katılımcı listesi',
    ],
    directory_mining: [
      'atık yağ geri dönüşüm firmaları listesi',
      'lisanslı atık yağ geri kazanım tesisleri',
      'atık yağ toplama firmaları lisanslı liste',
    ],
    project_signal: [
      'atık yağ geri dönüşüm ihalesi',
      'atık yağ tesisi izni',
      'atık yağ rafineri yatırım',
      'çevre izni atık yağ geri dönüşüm',
      'yeni atık yağ işleme tesisi',
      'atık yağ kapasite artışı',
    ],
    regulatory_registry: [
      'lisanslı atık yağ toplayıcıları sicili',
      'çevre bakanlığı atık yağ lisanslı tesisler listesi',
      'tehlikeli atık taşıyıcı kayıt listesi atık yağ',
      'onaylı atık yağ geri kazanım tesisleri kayıt',
    ],
  },
  id: {
    company_discovery: [
      'perusahaan daur ulang oli bekas',
      'pabrik daur ulang oli bekas',
      'pengumpulan oli bekas',
      'pengolahan oli bekas',
    ],
    recycler_discovery: [
      'daur ulang oli bekas',
      'regenerasi oli bekas',
      'pengolahan limbah minyak',
    ],
    base_oil_sellers: [
      'pemasok base oil daur ulang',
      'base oil re-refining jual',
      'produsen base oil regenerasi',
    ],
    regulatory_docs: [
      'lembar data keselamatan base oil daur ulang MSDS',
      'izin lingkungan pabrik daur ulang oli bekas',
      'izin pengelolaan limbah B3 oli bekas',
      'sertifikat pengelolaan limbah minyak bekas',
      'dokumen AMDAL pengolahan oli bekas',
    ],
    trade_flow: [
      'importir oli bekas HS 2710 data bea cukai',
      'eksportir base oil daur ulang perdagangan',
      'impor ekspor oli bekas perusahaan',
      'data perdagangan base oil re-refining',
    ],
    tradeshow_discovery: [
      'IFAT peserta pameran daur ulang oli bekas',
      'pameran daur ulang oli peserta base oil',
      'ADIPEC peserta pameran pengolahan minyak',
    ],
    directory_mining: [
      'daftar perusahaan daur ulang oli bekas',
      'perusahaan pengolah limbah B3 oli bekas terdaftar',
      'asosiasi pengolah oli bekas anggota daftar',
    ],
    project_signal: [
      'tender daur ulang oli bekas',
      'izin pabrik daur ulang oli',
      'investasi pabrik re-refining oli bekas',
      'izin lingkungan daur ulang oli',
      'proyek pabrik base oil baru',
    ],
    regulatory_registry: [
      'daftar perusahaan pengumpul oli bekas berizin',
      'izin pengelolaan limbah B3 oli bekas daftar perusahaan',
      'transporter limbah B3 oli bekas terdaftar',
      'perusahaan pengolah oli bekas terdaftar KLHK',
    ],
  },
  zh: {
    company_discovery: [
      '废油回收公司',
      '废润滑油再生工厂',
      '废油收集',
      '基础油再生',
      '废油处理',
    ],
    recycler_discovery: [
      '废油再生',
      '润滑油再生',
      '废机油回收',
    ],
    base_oil_sellers: [
      '再生基础油供应商',
      '回收基础油销售',
      '再生基础油生产商',
    ],
    regulatory_docs: [
      '再生基础油安全数据表 MSDS',
      '废矿物油经营许可证',
      '危险废物经营许可证 废润滑油',
      '环评报告 废油再生',
      '废油处理企业资质证书',
      '危险废物综合经营许可证 废油',
    ],
    trade_flow: [
      '废油进口商 HS 2710 海关数据',
      '再生基础油出口商 贸易数据',
      '废润滑油进出口企业',
      '再生基础油出口贸易流向',
    ],
    tradeshow_discovery: [
      'IFAT参展商 废油回收 基础油',
      '润滑油展会参展商 废油再生',
      '环保展览会参展商 废油处理',
    ],
    directory_mining: [
      '废油回收企业名录 列表',
      '废油再生企业资质名单',
      '危险废物经营许可证企业名录 废油',
    ],
    project_signal: [
      '废油回收招标',
      '废油处理许可证',
      '废油再生工厂投资',
      '废油回收环保许可',
      '新建废油再生基地',
      '废润滑油处理项目招标',
    ],
    regulatory_registry: [
      '废油回收企业许可证名录',
      '危险废物经营许可证 废矿物油 企业名单',
      '废油收集运输资质企业登记',
      '废润滑油处理许可企业目录',
    ],
  },
  ru: {
    company_discovery: [
      'компания переработки отработанного масла',
      'завод регенерации масел',
      'сбор отработанного масла',
      'базовое масло регенерация',
    ],
    recycler_discovery: [
      'переработка отработанного масла',
      'регенерация масел',
      'утилизация отработанного масла',
    ],
    base_oil_sellers: [
      'поставщик регенерированного базового масла',
      'переработанное базовое масло продажа',
      'производитель регенерированного масла',
    ],
    regulatory_docs: [
      'паспорт безопасности регенерированное базовое масло',
      'лицензия на обращение с отходами отработанное масло',
      'разрешение на переработку отработанных масел',
      'экологическая экспертиза завод регенерации масел',
      'лицензия опасные отходы отработанное масло',
    ],
    trade_flow: [
      'импортер отработанного масла HS 2710 таможенные данные',
      'экспортер регенерированного базового масла торговля',
      'импорт экспорт отработанного масла компания',
      'торговые потоки базового масла переработка',
    ],
    tradeshow_discovery: [
      'IFAT участник выставки переработка масла',
      'выставка переработки масел участники список',
      'конференция базовые масла участники экспоненты',
    ],
    directory_mining: [
      'каталог предприятий переработка отработанных масел',
      'реестр лицензированных переработчиков масел',
      'список компаний регенерация масел Россия',
    ],
    project_signal: [
      'тендер переработка отработанного масла',
      'разрешение переработка масел',
      'строительство завода регенерации масел',
      'инвестиции завод переработки отработанного масла',
      'экологическое разрешение переработка масла',
      'расширение мощностей регенерации масел',
    ],
    regulatory_registry: [
      'реестр лицензированных сборщиков отработанного масла',
      'список лицензиатов переработка отработанных масел',
      'реестр перевозчиков опасных отходов масло',
      'лицензированные операторы обращения с отработанными маслами',
    ],
  },
  ja: {
    company_discovery: [
      '廃油リサイクル会社',
      '廃油再生工場',
      '廃油回収',
      '基油再生',
    ],
    recycler_discovery: [
      '廃油リサイクル',
      '潤滑油再生',
      '廃油処理',
    ],
    base_oil_sellers: [
      'リサイクル基油サプライヤー',
      '再精製基油販売',
      '再生基油メーカー',
    ],
    regulatory_docs: [
      '再生基油 安全データシート SDS',
      '廃油処理業 許可証',
      '産業廃棄物処理業許可 廃油',
      '特別管理産業廃棄物 廃油 許可',
      '廃油再生施設 環境アセスメント',
    ],
    trade_flow: [
      '廃油輸入業者 HS 2710 通関データ',
      '再生基油輸出業者 貿易データ',
      '廃潤滑油輸入輸出企業',
      '再生基油貿易フロー',
    ],
    tradeshow_discovery: [
      'IFAT出展者 廃油リサイクル 基油',
      '潤滑油展示会 出展者 廃油再生',
      '環境展示会 廃油処理 出展者リスト',
    ],
    directory_mining: [
      '廃油リサイクル業者一覧 名簿',
      '産業廃棄物処理業者名簿 廃油',
      '廃油再生事業者 許可業者リスト',
    ],
    project_signal: [
      '廃油リサイクル入札',
      '廃油処理施設許可',
      '廃油再生プラント建設',
      '廃油リサイクル環境許可',
      '新規廃油処理工場投資',
    ],
    regulatory_registry: [
      '廃油回収業者 許可 登録名簿',
      '産業廃棄物処理業者 許可一覧 廃油',
      '廃油運搬業者 登録リスト',
      '認定廃油処理施設 一覧 都道府県',
    ],
  },
  ar: {
    company_discovery: [
      'شركة إعادة تدوير الزيوت المستعملة',
      'مصنع إعادة تدوير الزيوت',
      'جمع الزيوت المستعملة',
      'تكرير الزيوت الأساسية',
    ],
    recycler_discovery: [
      'إعادة تدوير الزيوت المستعملة',
      'تجديد الزيوت',
      'معالجة الزيوت المستعملة',
    ],
    base_oil_sellers: [
      'مورد زيوت أساسية معاد تدويرها',
      'زيوت أساسية معاد تكريرها للبيع',
      'منتج زيوت أساسية مجددة',
    ],
    regulatory_docs: [
      'صحيفة بيانات السلامة زيت أساسي معاد تكريره',
      'ترخيص بيئي مصنع إعادة تدوير الزيوت المستعملة',
      'رخصة نفايات خطرة زيوت مستعملة',
      'تصريح جمع ونقل الزيوت المستعملة',
      'شهادة امتثال بيئي معالجة الزيوت',
    ],
    trade_flow: [
      'مستورد زيوت مستعملة HS 2710 بيانات جمركية',
      'مصدر زيت أساسي معاد تكريره تجارة',
      'استيراد تصدير زيوت مستعملة شركة',
      'بيانات تجارية زيت أساسي معاد تدويره',
    ],
    tradeshow_discovery: [
      'ADIPEC عارض إعادة تدوير الزيوت',
      'معرض البيئة عارض معالجة الزيوت المستعملة',
      'مؤتمر الزيوت الأساسية عارضون قائمة',
    ],
    directory_mining: [
      'دليل شركات إعادة تدوير الزيوت المستعملة',
      'قائمة مصانع إعادة تكرير الزيوت المرخصة',
      'سجل شركات جمع الزيوت المستعملة المعتمدة',
    ],
    project_signal: [
      'مناقصة إعادة تدوير الزيوت',
      'ترخيص مصنع إعادة تدوير الزيوت',
      'استثمار مصنع تكرير الزيوت المستعملة',
      'تصريح بيئي إعادة تدوير الزيوت',
      'إنشاء مصنع جديد للزيوت الأساسية',
    ],
    regulatory_registry: [
      'سجل جامعي الزيوت المستعملة المرخصين',
      'قائمة المنشآت المرخصة لمعالجة الزيوت المستعملة',
      'سجل ناقلي النفايات الخطرة زيوت مستعملة',
      'المشغلون المعتمدون لإعادة تدوير الزيوت سجل حكومي',
    ],
  },
  hi: {
    company_discovery: [
      'प्रयुक्त तेल पुनर्चक्रण कंपनी',
      'अपशिष्ट तेल पुनर्चक्रण संयंत्र',
      'प्रयुक्त तेल संग्रह',
    ],
    recycler_discovery: [
      'अपशिष्ट तेल पुनर्चक्रण',
      'स्नेहक पुनर्जनन',
    ],
    base_oil_sellers: [
      'पुनर्चक्रित बेस ऑयल आपूर्तिकर्ता',
      'पुनः शोधित बेस ऑयल बिक्री',
      'पुनर्जनित बेस ऑयल निर्माता',
    ],
    regulatory_docs: [
      'सुरक्षा डेटा शीट पुनर्चक्रित बेस ऑयल',
      'पर्यावरण अनुमति अपशिष्ट तेल प्रसंस्करण संयंत्र',
      'खतरनाक अपशिष्ट लाइसेंस प्रयुक्त तेल',
      'CPCB प्राधिकरण अपशिष्ट तेल पुनर्चक्रण',
      'राज्य प्रदूषण नियंत्रण बोर्ड अपशिष्ट तेल अनुमति',
    ],
    trade_flow: [
      'अपशिष्ट तेल आयातक HS 2710 सीमा शुल्क डेटा',
      'पुनर्चक्रित बेस ऑयल निर्यातक व्यापार',
      'प्रयुक्त तेल आयात निर्यात कंपनी',
      'बेस ऑयल व्यापार प्रवाह डेटा',
    ],
    regulatory_registry: [
      'अपशिष्ट तेल संग्रहकर्ता लाइसेंस सूची CPCB',
      'खतरनाक अपशिष्ट तेल परिवहनकर्ता पंजीकृत सूची',
      'अधिकृत अपशिष्ट तेल पुनर्चक्रणकर्ता सरकारी रजिस्ट्री',
    ],
  },
  vi: {
    company_discovery: [
      'công ty tái chế dầu thải',
      'nhà máy tái chế dầu thải',
      'thu gom dầu thải',
    ],
    recycler_discovery: [
      'tái chế dầu thải',
      'tái sinh dầu nhớt',
    ],
    base_oil_sellers: [
      'nhà cung cấp dầu gốc tái chế',
      'dầu gốc tái chế bán',
      'nhà sản xuất dầu gốc tái sinh',
    ],
  },
  nl: {
    company_discovery: [
      'afgewerkte olie recycling bedrijf',
      'afgewerkte olie verwerking',
    ],
    base_oil_sellers: [
      'gerecycled basisolie leverancier',
      'geregenereerd basisolie verkoop',
    ],
  },
  it: {
    company_discovery: [
      'azienda riciclo olio usato',
      'impianto riciclo olio usato',
    ],
    base_oil_sellers: [
      'fornitore olio base riciclato',
      'olio base ri-raffinato vendita',
    ],
  },
  fa: {
    company_discovery: [
      'شرکت بازیافت روغن مستعمل',
      'کارخانه بازیافت روغن',
    ],
    base_oil_sellers: [
      'تامین کننده روغن پایه بازیافتی',
      'روغن پایه بازیافتی فروش',
    ],
  },
};

const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  IN: 'hi', AE: 'ar', SA: 'ar', NG: 'en', ID: 'id', TR: 'tr', VN: 'vi',
  ZA: 'en', BR: 'pt', MX: 'es', DE: 'de', CN: 'zh', JP: 'ja', RU: 'ru',
  ES: 'es', FR: 'fr', US: 'en', GB: 'en', AU: 'en', CA: 'en', EG: 'ar',
  KE: 'en', IR: 'fa', IQ: 'ar', KW: 'ar', QA: 'ar', BH: 'ar', OM: 'ar',
  NL: 'nl', IT: 'it', IE: 'en', PL: 'pl', CZ: 'cs', RO: 'ro', GR: 'el',
  PT: 'pt', SE: 'sv', FI: 'fi', DK: 'da', NO: 'no', BE: 'nl', AT: 'de', CH: 'de',
};

function generateDomainFingerprint(name: string, domain: string): string {
  const normalized = `${(name || '').toLowerCase().trim()}|${(domain || '').toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 64);
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const NEWS_MEDIA_DOMAINS = [
  'reuters.com', 'bloomberg.com', 'forbes.com', 'ft.com', 'wsj.com',
  'bbc.com', 'bbc.co.uk', 'cnn.com', 'cnbc.com', 'nytimes.com',
  'theguardian.com', 'aljazeera.com', 'economictimes.indiatimes.com',
  'livemint.com', 'moneycontrol.com', 'businessinsider.com',
  'uol.com.br', 'capitalreset.uol.com.br', 'globo.com', 'folha.uol.com.br',
  'valor.globo.com', 'exame.com', 'infomoney.com.br',
  'elpais.com', 'expansion.com', 'cincodias.elpais.com',
  'handelsblatt.com', 'wiwo.de', 'faz.net', 'spiegel.de',
  'lemonde.fr', 'lesechos.fr', 'latribune.fr',
  'ilsole24ore.com', 'corriere.it', 'repubblica.it',
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
  'youtube.com', 'reddit.com', 'medium.com', 'wikipedia.org',
  'en.wikipedia.org', 'news.google.com', 'google.com',
  'yahoo.com', 'finance.yahoo.com', 'tradearabia.com',
  'gulfnews.com', 'arabianbusiness.com', 'khaleejtimes.com',
  'prnewswire.com', 'businesswire.com', 'globenewswire.com',
  'marketwatch.com', 'seekingalpha.com', 'investing.com',
  'letsrecycle.com', 'lube-media.com', 'fueloilnews.co.uk',
  'businessmotoring.co.uk', 'bw-magazine.co.uk', 'mrw.co.uk',
  'hwchamber.co.uk', 'pmmonline.co.uk', 'biofuels-news.com',
  'chemical-recycling-europe.prezly.com', 'technavio.com',
  'tyreandrubberrecycling.com', 'carbon-pulse.com',
  'wastedive.com', 'waste360.com', 'recyclingtoday.com',
  'edie.net', 'endsreport.com', 'resource.co', 'circularonline.co.uk',
  'chemicalwatch.com', 'icis.com', 'platts.com',
];

function isNewsOrMediaDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return NEWS_MEDIA_DOMAINS.some(nd => d === nd || d.endsWith('.' + nd));
}

function getScoreBand(score: number): string {
  if (score >= 75) return 'hot';
  if (score >= 60) return 'strong';
  if (score >= 50) return 'qualified';
  if (score >= 40) return 'watchlist';
  return 'low';
}

function generateSearchQueries(country: string, isoCode: string, language: string): { query: string; language: string; family: string }[] {
  const queries: { query: string; language: string; family: string }[] = [];
  const families = ['company_discovery', 'recycler_discovery', 'base_oil_sellers', 'regulatory_docs', 'trade_flow', 'tradeshow_discovery', 'directory_mining', 'project_signal', 'regulatory_registry'];

  for (const family of families) {
    const enQueries = MULTILINGUAL_QUERIES.en?.[family] || [];
    for (const q of enQueries.slice(0, 4)) {
      const isGlobalAssociationQuery = family === 'directory_mining' && (
        q.includes('association') || q.includes('members') || q.includes('registry')
      );
      if (isGlobalAssociationQuery) {
        queries.push({ query: q, language: 'en', family });
        queries.push({ query: `${q} ${country}`, language: 'en', family });
      } else {
        queries.push({ query: `${q} ${country}`, language: 'en', family });
      }
    }

    if (language !== 'en') {
      const localQueries = MULTILINGUAL_QUERIES[language]?.[family] || [];
      for (const q of localQueries.slice(0, 4)) {
        queries.push({ query: `${q} ${country}`, language, family });
      }
    }
  }

  return queries;
}

async function executeGoogleSearch(query: string, countryCode?: string, startIndex?: number): Promise<any> {
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
    throw new Error('Google Custom Search API not configured');
  }

  const exclusions = [
    '-job', '-employment', '-manual', '-handbook', '-recipe', '-cooking',
    '-"olive oil"', '-"coconut oil"', '-"palm oil"', '-"essential oil"',
    '-"sunflower oil"', '-"vegetable oil"', '-"canola oil"', '-"sesame oil"',
    '-"castor oil"', '-"fish oil"', '-"flaxseed oil"', '-"avocado oil"',
    '-"hair oil"', '-"skin oil"', '-"baby oil"', '-"massage oil"',
    '-"tea tree oil"', '-"argan oil"', '-"jojoba oil"',
    '-skincare', '-cosmetic', '-beauty', '-perfume', '-fragrance', '-aromatherapy',
    '-"clay bar"', '-"oil painting"', '-"crude oil futures"', '-"oil price"',
    '-wikipedia', '-linkedin', '-youtube', '-amazon', '-pinterest',
    '-"tyre recycling"', '-"tire recycling"', '-"battery recycling"',
    '-"plastic recycling"', '-"metal recycling"', '-"paper recycling"',
    '-"glass recycling"', '-"textile recycling"', '-"wood recycling"',
    '-"e-waste"', '-"electronic waste"', '-"food waste"', '-"garden waste"',
    '-"pharmaceutical"', '-"nuclear"', '-"radioactive"',
    '-"art supplies"', '-"oil spill"', '-"ship recycling"', '-"shipbreaking"',
    '-museum', '-gallery', '-auction',
    '-"real estate"', '-"legal tender"', '-"property for sale"',
    '-"water treatment"', '-"sewage"', '-"wastewater"',
    '-"solar panel"', '-"wind turbine"', '-"electric vehicle"',
    '-"mining waste"', '-"construction waste"', '-"demolition waste"',
  ].join(' ');

  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query + exclusions,
    num: '10',
  });

  if (startIndex && startIndex > 1) {
    params.set('start', String(startIndex));
  }

  if (countryCode && countryCode !== 'all') {
    params.set('cr', `country${countryCode}`);
  }

  const response = await fetch(`${GOOGLE_SEARCH_URL}?${params}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error: ${response.status} - ${errorText}`);
  }
  return response.json();
}

async function crawlPage(url: string): Promise<{
  success: boolean;
  title: string;
  metaDescription: string;
  visibleText: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  language: string;
  httpStatus: number;
  error?: string;
}> {
  const result = {
    success: false, title: '', metaDescription: '', visibleText: '',
    emails: [] as string[], phones: [] as string[], addresses: [] as string[],
    language: 'en', httpStatus: 0, error: undefined as string | undefined,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThermopacRadar/1.0; +https://thermopac.in)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    result.httpStatus = response.status;
    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      result.error = 'Not HTML content';
      return result;
    }

    const html = await response.text();
    const maxLen = 100000;
    const truncatedHtml = html.length > maxLen ? html.substring(0, maxLen) : html;

    const titleMatch = truncatedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    result.title = titleMatch ? titleMatch[1].trim().substring(0, 500) : '';

    const metaMatch = truncatedHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    result.metaDescription = metaMatch ? metaMatch[1].trim().substring(0, 1000) : '';

    let text = truncatedHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    result.visibleText = text.substring(0, 10000);

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailNoisePatterns = [
      'example.', 'sentry', 'wixpress', 'cloudflare', 'googleapis',
      'webpack', 'schema.org', 'w3.org', 'mozilla.org',
      'noreply', 'no-reply', 'mailer-daemon', 'postmaster',
      'unsubscribe', 'bounce', 'test@', 'admin@localhost',
      '@doe.com', '@example.com', '@test.com', '@email.com',
      '@placeholder', '@fake', '@dummy', '@sample',
      'user@', 'name@domain', 'email@domain', 'your@email',
      '@sentry.io', '@github.com', '@google.com', '@facebook.com',
    ];
    const emails = (truncatedHtml.match(emailRegex) || []).filter(e => {
      if (e.endsWith('.png') || e.endsWith('.jpg') || e.endsWith('.svg') || e.endsWith('.gif') || e.endsWith('.css') || e.endsWith('.js')) return false;
      if (emailNoisePatterns.some(p => e.toLowerCase().includes(p))) return false;
      if (e.length > 60) return false;
      return true;
    });
    result.emails = [...new Set(emails)].slice(0, 10);

    const phoneRegex = /(?:\+\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{2,5}[-.\s]?\d{2,8}/g;
    const rawPhones = (text.match(phoneRegex) || []);
    const phones = rawPhones.filter(p => {
      const trimmed = p.trim();
      const digitsOnly = trimmed.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
      if (trimmed.includes('.')) return false;
      if (/^\d{4}[-–]\d{2,4}$/.test(trimmed)) return false;
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
      if (/^\d{6}-\d{2}$/.test(trimmed)) return false;
      if (/^\d{5,6}-\d{2,3}$/.test(trimmed)) return false;
      if (/^\d{3,8}$/.test(trimmed)) return false;
      if (/^20\d{2}[\s-]/.test(trimmed) || /^19\d{2}[\s-]/.test(trimmed)) return false;
      const startsWithPlus = trimmed.startsWith('+');
      const hasParenArea = /\(\d{2,5}\)/.test(trimmed);
      const hasStdFormat = /^0\d{2,4}\s?\d{3,4}\s?\d{3,5}$/.test(trimmed);
      const hasIntlFormat = /^\+\d{1,4}[\s-]/.test(trimmed);
      if (!startsWithPlus && !hasParenArea && !hasStdFormat && !hasIntlFormat) return false;
      if (/\s\d{1,2}$/.test(trimmed) && !startsWithPlus) return false;
      return true;
    });
    result.phones = [...new Set(phones)].slice(0, 10);

    const langMatch = truncatedHtml.match(/<html[^>]*lang=["']([a-z]{2})/i);
    result.language = langMatch ? langMatch[1] : 'en';

    result.success = true;
  } catch (error: any) {
    result.error = error.message || 'Crawl failed';
  }
  return result;
}

async function classifyCompanyWithAI(
  title: string, snippet: string, url: string, crawledContent?: string
): Promise<any> {
  try {
    const prompt = `You are an expert B2B analyst specializing in waste oil recycling and re-refining industry.

Analyze this company/result and classify it. The text may be in any language - translate if necessary.

Title: ${title}
URL: ${url}
Snippet: ${snippet}
${crawledContent ? `Website Content (excerpt): ${crawledContent.substring(0, 3000)}` : ''}

CRITICAL CLASSIFICATION RULES:
1. "company_name" must be the OFFICIAL company name in its original casing (e.g. "LWART" not "Lwart", "AVISTA OIL" not "Avista Oil"). Use UPPERCASE if the company brand is uppercase. NEVER use page titles as company names — strip suffixes like ": Home", " - Homepage", " | Official Site", " - Home Page". If you cannot determine the actual company name, set company_type to "not_relevant".
2. "company_website" must be the company's OWN website URL (e.g. "https://lwart.com.br"), NOT the news article or source URL. If the source is a news article about a company, extract the actual company domain. Return null if unknown.
3. Boolean flags MUST be consistent with company_type: if company_type is "re_refiner" then is_existing_rerefiner MUST be true and handles_waste_oil MUST be true. If company_type is "used_oil_collector" then is_collector_only MUST be true and handles_waste_oil MUST be true. If company_type is "waste_oil_recycler" then handles_waste_oil MUST be true.
4. ONLY classify as relevant (waste_oil_recycler, re_refiner, used_oil_collector, etc.) if the company deals with PETROLEUM-BASED oils — lubricant oil, motor oil, hydraulic oil, transformer oil, industrial oil. Companies that ONLY deal with cooking oil / vegetable oil / edible oil recycling must be classified as "not_relevant" because they are NOT in the waste oil re-refining industry.
5. Large corporations not primarily in the waste oil business (automotive OEMs, oil majors, commodity traders, retailers, banks, government agencies) should be classified as "not_relevant" unless they have a specific waste oil recycling division.
6. GENERAL WASTE MANAGEMENT COMPANIES that merely collect or accept oil as one of many waste types (skip hire, general recycling, hazardous waste removal, data destruction, commercial waste) must be classified as "waste_management_company" with LOW scores (feedstock <20, capital <15, strategic <15). Only classify as "waste_oil_recycler" or "re_refiner" if the company PRIMARILY focuses on oil recycling/re-refining as its core business.
7. If the source is an article/news page (not a company website), extract the ACTUAL company mentioned in the article. If the article discusses multiple companies or is general industry news, classify as "not_relevant" with company_name set to the article's subject company if identifiable.
8. Set ALL score estimates (feedstock, capital, strategic, contactability) to 0 for "not_relevant" companies.
9. REGULATORY DOCUMENT SIGNALS: If the source is an SDS (Safety Data Sheet), TDS (Technical Data Sheet), environmental permit, hazardous waste license, or regulatory filing, extract the COMPANY that issued/owns the document — these are extremely high-value signals. The company name, facility location, product details, and contact info are usually embedded in these documents. Set classification_confidence to 0.95+ for companies found via regulatory documents.
10. If a URL points to a PDF document (SDS, TDS, permit, license), analyze the title and snippet carefully — they typically contain the issuing company name and product type. The company that published the SDS/TDS is the one to classify.
11. TRADE FLOW SIGNALS: If the source contains import/export customs data, trade records, HS code 2710 shipments, or bill-of-lading data, extract the IMPORTER and EXPORTER company names. Companies importing waste oil or exporting re-refined base oil are very likely plant operators or major traders connected to re-refining plants. Set is_likely_epc_target=true for companies importing large volumes of waste oil (they likely need processing capacity).
12. TRADE SHOW SIGNALS: If the source is a trade show exhibitor directory or conference participant list (IFAT, Ecomondo, Pollutec, UNITI, ICIS, Lubricant Expo, ADIPEC, etc.), the companies listed are pre-qualified industry participants. Extract their names, descriptions, and booth/stand info. These are high-confidence leads — set classification_confidence to 0.90+ for exhibitors at relevant industry events.
13. CONSULTING/FEASIBILITY COMPANIES: Companies that SELL feasibility studies, business plans, or project consulting (e.g. "start an oil recycling plant" guides, "cost of oil recycling factory" reports) are NOT actual recyclers. They are consulting firms. Classify as "not_relevant". Look for clues: "feasibility study", "business plan", "project cost", "how to start", "مشروع" (project/business plan in Arabic), "estudio de factibilidad", "دراسة جدوى" (feasibility study in Arabic).
14. EQUIPMENT MANUFACTURERS: Companies that manufacture recycling equipment, machinery, boilers, reactors, or distillation units but do NOT operate recycling plants themselves should be classified as "not_relevant". They sell equipment TO recyclers but are not recyclers. Examples: filtration system makers, distillation equipment sellers, pyrolysis reactor manufacturers.
15. SHIPBUILDERS & MARINE: Companies that build ships, barges, or marine vessels (even waste oil collection vessels) are NOT oil recyclers. Classify as "not_relevant".
16. NGOs/FOUNDATIONS/ASSOCIATIONS: Industry associations, awareness foundations, and NGOs that promote recycling but do NOT actually collect or process oil should be classified as "not_relevant". They are advocacy bodies, not commercial operators.
17. COUNTRY ACCURACY: The "country" and "iso_code" fields must reflect WHERE THE COMPANY ACTUALLY OPERATES, not where the Google search was targeted. If a Saudi Arabia search finds a company based in Egypt, set country to "Egypt" and iso_code to "EG". Look for headquarters location, registered address, and operational base.
18. BRAND STORES & RETAILERS: Consumer product companies (Nike, Dyson, Clarins, YSL, Amazon, Jaguar, etc.), luxury brands, cosmetics, electronics, automotive showrooms, and e-commerce sites are always "not_relevant" regardless of any keyword matches.

Respond with JSON:
{
  "company_name": "OFFICIAL company name in original casing",
  "company_website": "https://company-own-domain.com or null if unknown",
  "company_type": "one of: used_oil_collector, waste_oil_recycler, re_refiner, waste_management_company, lubricant_company, base_oil_company, industrial_recycler, hazardous_waste_company, trader_only, not_relevant, unclear",
  "company_summary": "2-3 sentence summary of what this company does",
  "classification_evidence": "specific text evidence supporting classification",
  "classification_confidence": 0.0 to 1.0,
  "handles_waste_oil": true/false,
  "is_plant_opportunity": true/false,
  "is_existing_rerefiner": true/false,
  "is_collector_only": true/false,
  "is_likely_epc_target": true/false,
  "country": "detected country name",
  "iso_code": "2-letter ISO code",
  "feedstock_access_estimate": 0-100,
  "capital_capability_estimate": 0-100,
  "strategic_fit_estimate": 0-100,
  "contactability_estimate": 0-100,
  "urgency": "low/medium/high/critical",
  "project_signals": [{"type": "tender|permit_stage|expansion|new_plant|upgrade_modernization|investment_signal|partnership_signal|weak_signal", "summary": "...", "evidence": "...", "confidence": 0.0-1.0}]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert waste oil recycling industry analyst. Always respond with valid JSON. Be strict in classification - only classify as relevant if there is clear evidence." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('AI classification error:', error);
    return {
      company_name: title,
      company_type: 'unclear',
      company_summary: snippet,
      classification_evidence: 'AI classification unavailable',
      classification_confidence: 0.1,
      handles_waste_oil: false,
      is_plant_opportunity: false,
      is_existing_rerefiner: false,
      is_collector_only: false,
      is_likely_epc_target: false,
      feedstock_access_estimate: 0,
      capital_capability_estimate: 0,
      strategic_fit_estimate: 0,
      contactability_estimate: 0,
      urgency: 'low',
      project_signals: [],
    };
  }
}

async function extractCompaniesFromDirectory(
  title: string, snippet: string, url: string, crawledContent: string
): Promise<any[]> {
  try {
    const prompt = `You are an expert B2B analyst. This page appears to be a DIRECTORY, MEMBER LIST, or ASSOCIATION PAGE that lists MULTIPLE companies in the waste oil recycling / re-refining / base oil industry.

Title: ${title}
URL: ${url}
Snippet: ${snippet}
Page Content: ${crawledContent.substring(0, 6000)}

Extract ALL companies mentioned on this page that are related to waste oil, used oil, base oil, lubricant recycling, or re-refining.

For EACH company found, provide:
- company_name: Official name
- company_website: Their website URL if mentioned (null if not found)
- company_type: one of: used_oil_collector, waste_oil_recycler, re_refiner, waste_management_company, lubricant_company, base_oil_company, not_relevant
- country: Country where they operate
- brief_description: 1 sentence about what they do

ONLY include companies that deal with PETROLEUM-based oils (not cooking oil).
Skip the directory/association itself — only extract the MEMBER companies.

Respond with JSON:
{
  "is_directory": true/false,
  "directory_name": "Name of the directory/association",
  "companies": [
    {
      "company_name": "...",
      "company_website": "https://... or null",
      "company_type": "...",
      "country": "...",
      "brief_description": "..."
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert industry analyst. Extract all relevant companies from directory/member pages. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.is_directory ? (result.companies || []) : [];
  } catch (error) {
    console.error('Directory extraction error:', error);
    return [];
  }
}

function isLikelyDirectoryPage(title: string, snippet: string, url: string): boolean {
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  const titleLC = title.toLowerCase();
  const urlLC = url.toLowerCase();

  const directorySignals = [
    'member', 'directory', 'list of', 'our members', 'exhibitor list',
    'company directory', '/members', '/directory', '/exhibitors',
    'miembros', 'directorio', 'membros', 'mitglieder', 'membres',
    'üyeler', 'anggota', '会员', '名录', '一覧', 'участники', 'каталог', 'أعضاء',
  ];

  const oilIndustryTerms = [
    'oil', 'lubricant', 'base oil', 'waste oil', 'used oil', 'petroleum',
    'refin', 're-refin', 'rerefin', 'recycl oil', 'oil recycl',
    'geir', 'ukla', 'ora ', 'oil association',
    'aceite', 'óleo', 'altöl', 'huile', 'yağ', 'масло', '油', 'زيت',
  ];

  const hasDirectorySignal = directorySignals.some(s => text.includes(s));
  const hasOilContext = oilIndustryTerms.some(s => text.includes(s));

  if (!hasDirectorySignal) return false;
  if (!hasOilContext) return false;

  const antiDirectoryTerms = [
    'tyre', 'tire', 'pharmaceutical', 'pharma', 'art suppli', 'painting',
    'cosmetic', 'skincare', 'beauty', 'fashion', 'food', 'plastic',
    'nuclear', 'radioactive', 'shipping', 'shipbreak', 'maritime spill',
    'cannabis', 'cbd', 'steel', 'construction', 'property', 'real estate',
    'banking', 'finance', 'insurance', 'automotive parts', 'car parts',
    'cooking', 'vegetable', 'olive', 'coconut', 'palm oil', 'sunflower',
    'essential oil', 'aromatherapy', 'fragrance', 'perfume',
    'battery', 'e-waste', 'electronic', 'weee', 'solar', 'wind turbine',
    'paper', 'glass', 'textile', 'wood', 'cardboard', 'bottle',
    'medical', 'clinical', 'hospital', 'dental',
    'mining', 'quarry', 'aggregate', 'cement', 'concrete',
    'furniture', 'clothing', 'apparel', 'garment',
    'farming', 'agriculture', 'livestock', 'poultry', 'dairy',
    'hotel', 'restaurant', 'catering', 'recruitment', 'staffing',
    'school', 'university', 'college', 'museum', 'gallery', 'auction',
    'football', 'cricket', 'rugby', 'sport', 'gym', 'fitness',
    'pet', 'veterinary', 'animal',
    'water treatment', 'sewage', 'wastewater', 'desalination',
  ];
  if (antiDirectoryTerms.some(t => titleLC.includes(t) || urlLC.includes(t))) return false;

  return true;
}

function isLikelyRegistryPage(title: string, snippet: string, url: string): boolean {
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  const titleLC = title.toLowerCase();
  const urlLC = url.toLowerCase();

  const registrySignals = [
    'license', 'licence', 'permit', 'approved operator', 'registered transporter',
    'authorized recycler', 'authorised recycler', 'licensed collector', 'licenced collector',
    'permit holder', 'registered carrier', 'registered broker', 'registered dealer',
    'approved facility', 'licensed facility', 'certified operator', 'accredited operator',
    'registry', 'register of', 'public register',
    '/register', '/registry', '/permits', '/licenses', '/licences',
    'licencia', 'permiso', 'autorizado', 'registrado',
    'licença', 'autorizado', 'registrado', 'cadastro',
    'genehmigung', 'zugelassen', 'lizenziert', 'registriert',
    'autorisation', 'agréé', 'autorisé', 'enregistré',
    'lisans', 'izin', 'onaylı', 'kayıtlı',
    'лицензия', 'разрешение', 'реестр', 'зарегистрирован',
    '許可', '認可', '登録', '免許',
    'رخصة', 'تصريح', 'مرخص', 'مسجل',
    '许可', '登记', '注册', '资质',
  ];

  const oilIndustryTerms = [
    'oil', 'lubricant', 'base oil', 'waste oil', 'used oil', 'petroleum',
    'refin', 're-refin', 'rerefin', 'recycl', 'hazardous waste',
    'aceite', 'óleo', 'altöl', 'huile', 'yağ', 'масло', '油', 'زيت',
    'waste carrier', 'waste broker', 'waste dealer',
  ];

  const hasRegistrySignal = registrySignals.some(s => text.includes(s));
  const hasOilContext = oilIndustryTerms.some(s => text.includes(s));

  if (!hasRegistrySignal) return false;
  if (!hasOilContext) return false;

  const antiRegistryTerms = [
    'cooking', 'vegetable', 'olive', 'coconut', 'palm oil', 'sunflower',
    'essential oil', 'cosmetic', 'beauty', 'fragrance', 'perfume',
    'tyre', 'tire', 'pharmaceutical', 'nuclear', 'radioactive',
    'cannabis', 'cbd', 'banking', 'finance', 'insurance',
    'water treatment', 'sewage', 'wastewater', 'desalination',
    'mining', 'quarry', 'construction', 'demolition',
  ];
  if (antiRegistryTerms.some(t => titleLC.includes(t) || urlLC.includes(t))) return false;

  return true;
}

function calculateOpportunityScore(data: any, hasContacts: boolean, hasProjects: boolean): {
  final: number;
  components: Record<string, number>;
  band: string;
  explanation: string;
} {
  const feedstock = Math.min(Number(data.feedstock_access_estimate) || 0, 100);
  const capital = Math.min(Number(data.capital_capability_estimate) || 0, 100);
  const strategic = Math.min(Number(data.strategic_fit_estimate) || 0, 100);
  const projectSignal = hasProjects ? 70 : (data.is_plant_opportunity ? 50 : 10);
  const geography = data.iso_code && ['IN', 'AE', 'SA', 'NG', 'ID', 'TR', 'BR', 'MX'].includes(data.iso_code) ? 80 : 40;
  const contactability = hasContacts ? 80 : (Number(data.contactability_estimate) || 0);

  let final = Math.round(
    (feedstock * SCORING_WEIGHTS.feedstock_access +
     capital * SCORING_WEIGHTS.capital_capability +
     strategic * SCORING_WEIGHTS.strategic_fit +
     projectSignal * SCORING_WEIGHTS.project_signal_strength +
     geography * SCORING_WEIGHTS.geography +
     contactability * SCORING_WEIGHTS.contactability) / 100
  );

  const companyType = data.company_type || '';
  if (['re_refiner'].includes(companyType) && final < 45) {
    final = 45;
  } else if (['waste_oil_recycler', 'base_oil_company'].includes(companyType) && final < 35) {
    final = 35;
  } else if (['used_oil_collector', 'waste_management_company'].includes(companyType) && data.handles_waste_oil && final < 25) {
    final = 25;
  } else if (companyType !== 'not_relevant' && data.handles_waste_oil && final < 20) {
    final = 20;
  }

  const components = {
    feedstock_access: feedstock,
    capital_capability: capital,
    strategic_fit: strategic,
    project_signal: projectSignal,
    geography: geography,
    contactability: contactability,
  };

  const band = getScoreBand(final);
  const parts: string[] = [];
  if (feedstock > 50) parts.push(`Strong feedstock access (${feedstock})`);
  if (capital > 50) parts.push(`Good capital capability (${capital})`);
  if (strategic > 50) parts.push(`Strategic fit (${strategic})`);
  if (hasProjects) parts.push('Active project signals detected');
  if (hasContacts) parts.push('Contact information available');

  return { final, components, band, explanation: parts.join('. ') || 'Low opportunity indicators.' };
}

async function checkDuplicate(companyName: string, domain: string, country?: string): Promise<{ isDuplicate: boolean; duplicateOfId?: number; groupId?: string }> {
  try {
    if (domain && !isNewsOrMediaDomain(domain)) {
      const domainCheck = await db.execute(sql`
        SELECT id, duplicate_group_id FROM radar_companies WHERE LOWER(root_domain) = ${domain.toLowerCase()} LIMIT 1
      `);
      if (domainCheck.rows.length > 0) {
        return { isDuplicate: true, duplicateOfId: Number(domainCheck.rows[0].id), groupId: domainCheck.rows[0].duplicate_group_id as string };
      }
    }

    if (companyName) {
      const normalized = companyName.toLowerCase().trim()
        .replace(/\b(ltd|llc|inc|corp|co|gmbh|sa|srl|pvt|private|limited|company|group|plc|soluções|ambientais|solucoes|do brasil|brazil|services|solutions|uk|international)\b\.?/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalized.length > 2) {
        const nameCheck = await db.execute(sql`
          SELECT id, duplicate_group_id, canonical_name FROM radar_companies
          WHERE LOWER(REGEXP_REPLACE(canonical_name, '[^a-zA-Z0-9 ]', '', 'g')) LIKE ${'%' + normalized.substring(0, 25) + '%'}
          AND (country = ${country || ''} OR ${!country})
          LIMIT 1
        `);
        if (nameCheck.rows.length > 0) {
          console.log(`[Radar] DUPLICATE detected: "${companyName}" matches existing "${(nameCheck.rows[0] as any).canonical_name}"`);
          return { isDuplicate: true, duplicateOfId: Number(nameCheck.rows[0].id), groupId: nameCheck.rows[0].duplicate_group_id as string };
        }
      }
    }
  } catch (error) {
    console.error('Dedup check error:', error);
  }
  return { isDuplicate: false };
}

async function createAlert(alertType: string, priority: string, title: string, message: string, companyId?: number, projectId?: number, country?: string, sourceUrl?: string) {
  try {
    await db.execute(sql`
      INSERT INTO radar_alerts (alert_type, priority, company_id, project_id, country, title, message, source_url)
      VALUES (${alertType}, ${priority}, ${companyId || null}, ${projectId || null}, ${country || null}, ${title}, ${message}, ${sourceUrl || null})
    `);
  } catch (error) {
    console.error('Alert creation error:', error);
  }
}

async function updateCountryIntelligence(isoCode: string) {
  try {
    const stats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE company_type NOT IN ('not_relevant', 'unclear') AND overall_confidence >= 0.7 AND opportunity_score >= 35) as relevant,
        COUNT(*) FILTER (WHERE opportunity_score >= 70) as hot
      FROM radar_companies WHERE iso_code = ${isoCode}
    `);
    const projectStats = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM radar_projects WHERE iso_code = ${isoCode}
    `);

    const relevant = Number(stats.rows[0]?.relevant) || 0;
    const hot = Number(stats.rows[0]?.hot) || 0;
    const projects = Number(projectStats.rows[0]?.cnt) || 0;
    const score = Math.min(relevant * 5 + hot * 15 + projects * 10, 100);

    await db.execute(sql`
      UPDATE radar_country_intelligence
      SET relevant_company_count = ${relevant},
          hot_opportunity_count = ${hot},
          project_count = ${projects},
          opportunity_score = ${score},
          updated_at = NOW()
      WHERE iso_code = ${isoCode}
    `);
  } catch (error) {
    console.error('Country intelligence update error:', error);
  }
}

function enforceClassificationConsistency(aiResult: any): any {
  const type = (aiResult.company_type || '').toLowerCase();
  if (type === 're_refiner') {
    aiResult.is_existing_rerefiner = true;
    aiResult.handles_waste_oil = true;
    aiResult.is_collector_only = false;
  } else if (type === 'used_oil_collector') {
    aiResult.is_collector_only = true;
    aiResult.handles_waste_oil = true;
  } else if (type === 'waste_oil_recycler') {
    aiResult.handles_waste_oil = true;
    aiResult.is_collector_only = false;
  } else if (type === 'waste_management_company' || type === 'hazardous_waste_company') {
    aiResult.handles_waste_oil = true;
  }
  return aiResult;
}

async function processDiscoveryResult(
  userId: number, searchJobId: number, searchResultId: number,
  title: string, snippet: string, url: string, country: string, isoCode: string
) {
  try {
    const sourceDomain = extractDomain(url);
    const link = (url || '').toLowerCase();
    if (link.includes('/manual') || link.includes('/handbook')) return;

    const SKIP_DOMAINS = new Set([
      'walmart.com', 'amazon.com', 'alibaba.com', 'ebay.com', 'linkedin.com', 'facebook.com',
      'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
      'wikipedia.org', 'reddit.com', 'quora.com', 'stackoverflow.com',
      'ford.com', 'toyota.com', 'gm.com', 'bmw.com', 'mercedes-benz.com', 'honda.com',
      'lego.com', 'jnj.com', 'pg.com', 'nestle.com', 'unilever.com', 'coca-cola.com',
      'apple.com', 'google.com', 'microsoft.com', 'oracle.com', 'sap.com', 'ibm.com',
      'cmegroup.com', 'nasdaq.com', 'nyse.com', 'worldbank.org', 'imf.org',
      'gov.br', 'gov.in', 'gov.uk', 'gov.au', 'gov.ng', 'gov.za',
      'ifat.de', 'ecomondo.com', 'pollutec.com', 'uniti.de', 'icis.com',
      'lubricantexpo.com', 'adipec.com', 'tradekey.com', 'indiamart.com',
      'made-in-china.com', 'globalsources.com', 'thomasnet.com',
      'bayut.com', 'propertyfinder.ae', 'dubizzle.com', 'zillow.com', 'realtor.com',
      'nike.com', 'nike.sa', 'adidas.com', 'puma.com', 'reebok.com', 'newbalance.com',
      'dyson.com', 'dyson.sa', 'dyson.ae', 'dyson.co.uk', 'dyson.de',
      'clarins.com', 'clarins.sa', 'clarins.ae', 'yslbeauty.com', 'yslbeauty.sa',
      'kiehls.com', 'kiehls.sa', 'kiehls.ae', 'esteelauder.com', 'lancome.com',
      'loreal.com', 'maybelline.com', 'revlon.com', 'maccosmetics.com',
      'bobbibrown.com', 'clinique.com', 'nars.com', 'chanel.com', 'dior.com',
      'gucci.com', 'louisvuitton.com', 'hermes.com', 'prada.com', 'burberry.com',
      'jaguar.com', 'jaguar-saudi.com', 'landrover.com', 'bentley.com', 'rollsroyce.com',
      'ferrari.com', 'lamborghini.com', 'porsche.com', 'audi.com', 'volvo.com',
      'philips.com', 'samsung.com', 'lg.com', 'sony.com', 'panasonic.com',
      'ikea.com', 'ikea.sa', 'zara.com', 'hm.com', 'mango.com', 'gap.com',
      'amazon.sa', 'amazon.ae', 'amazon.de', 'amazon.co.uk', 'amazon.in',
      'noon.com', 'namshi.com', 'shein.com', 'temu.com',
      'bloomingdales.com', 'bloomingdales.sa', 'sephora.com', 'caretobeauty.com',
      'starbucks.com', 'mcdonalds.com', 'kfc.com', 'subway.com',
      'booking.com', 'airbnb.com', 'tripadvisor.com', 'expedia.com',
      'goldapple.ru', 'goldapple.sa', 'sssports.com',
      'yallamotor.com', 'carswitch.com', 'autotradersaudiarabia.com',
      'timberland.com', 'vparts.sa', 'mourjan.com', 'haraj.com.sa',
      'pennzoil.com', 'castrol.com', 'mobil.com', 'valvoline.com', 'shell.com',
      'bp.com', 'exxonmobil.com', 'totalenergies.com', 'chevron.com', 'sinopec.com',
      'fuchs.com', 'motul.com', 'liqui-moly.com', 'amsoil.com', 'royalpurple.com',
      'steelconstruction.info', 'constructiondive.com', 'construction.com',
      'recyclingtoday.com', 'waste360.com', 'wastedive.com',
      'sciencedirect.com', 'researchgate.net', 'academia.edu', 'springer.com',
      'wiley.com', 'elsevier.com', 'nature.com', 'mdpi.com',
      'investopedia.com', 'statista.com', 'worldometers.info',
      'bankofengland.co.uk', 'ecb.europa.eu', 'federalreserve.gov', 'bis.org',
      'bidstats.uk', 'contractsfinder.service.gov.uk', 'ted.europa.eu',
      'bbc.co.uk', 'bbc.com', 'parliament.uk', 'hansard.parliament.uk',
      'imo.org', 'cam.ac.uk', 'ox.ac.uk', 'imperial.ac.uk', 'ucl.ac.uk',
      'artuk.org', 'nationalarchives.gov.uk', 'spri.cam.ac.uk',
      'technavio.com', 'mordorintelligence.com', 'grandviewresearch.com',
      'lbma.org.uk', 'worldnuclear.org', 'onr.org.uk',
      'tyrerecovery.org.uk', 'bpf.co.uk', 'ciwm.co.uk', 'sps.nhs.uk',
    ]);
    const skipDomainParts = sourceDomain.split('.');
    const mainDomain = skipDomainParts.length >= 2 ? skipDomainParts.slice(-2).join('.') : sourceDomain;
    const fullDomain3 = skipDomainParts.length >= 3 ? skipDomainParts.slice(-3).join('.') : '';
    if (SKIP_DOMAINS.has(mainDomain) || SKIP_DOMAINS.has(fullDomain3)) {
      console.log(`[Radar] Skipping irrelevant domain: ${sourceDomain}`);
      return;
    }

    const RELEVANCE_KEYWORDS = new Set([
      'oil', 'lubricant', 'lubricating', 'lube', 'base oil', 'waste oil', 'used oil',
      'recycl', 'refin', 're-refin', 'rerefin', 'regenerat', 'reclaim', 'recover',
      'petroleum', 'petrochemical', 'bitumen', 'asphalt', 'grease',
      'hazardous waste', 'industrial waste', 'waste management', 'waste treatment',
      'environmental', 'disposal', 'collection', 'collector',
      'distillation', 'filtration', 'purification', 'dehydration',
      'HS 2710', 'SDS', 'TDS', 'safety data sheet',
      'IFAT', 'Ecomondo', 'Pollutec', 'UNITI', 'ICIS', 'ADIPEC', 'Lubricant Expo',
      'exhibitor', 'trade show', 'conference', 'expo',
      'tender', 'permit', 'license', 'plant', 'facility', 'refinery',
      'aceite', 'óleo', 'Altöl', 'huile', 'yağ', 'oli', 'масло', '油', 'زيت',
      'reciclaje', 'reciclagem', 'Recycling', 'recyclage', 'geri dönüşüm', 'daur ulang',
      're-raffinage', 'Aufbereitung', 'regeneración', 'rerrefino',
      'import', 'export', 'customs', 'shipment', 'trade flow',
    ]);

    const combinedText = `${title} ${snippet}`.toLowerCase();
    const relevanceHits = [...RELEVANCE_KEYWORDS].filter(kw => combinedText.includes(kw.toLowerCase()));
    
    if (relevanceHits.length === 0) {
      console.log(`[Radar] PRE-SCREEN REJECT: No industry keywords in title/snippet — "${title.substring(0, 80)}"`);
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    const ANTI_KEYWORDS = [
      'cooking oil', 'vegetable oil', 'olive oil', 'palm oil', 'coconut oil', 'sunflower oil',
      'canola oil', 'sesame oil', 'rapeseed oil', 'soybean oil', 'corn oil', 'peanut oil',
      'essential oil', 'cbd oil', 'cannabis oil', 'hemp oil', 'tea tree oil',
      'hair oil', 'skin oil', 'baby oil', 'massage oil', 'body oil', 'face oil',
      'argan oil', 'jojoba oil', 'castor oil', 'fish oil', 'cod liver oil', 'flaxseed oil',
      'avocado oil', 'almond oil', 'rosehip oil', 'neem oil', 'clove oil', 'eucalyptus oil',
      'skincare', 'cosmetic', 'beauty product', 'fragrance', 'aromatherapy', 'perfume',
      'makeup', 'foundation', 'mascara', 'lipstick', 'concealer', 'moisturizer', 'serum',
      'shampoo', 'conditioner', 'hair care', 'nail polish', 'body lotion', 'sunscreen',
      'oil painting', 'oil canvas', 'oil pastel', 'linseed oil artist', 'watercolour',
      'oil price forecast', 'crude oil futures', 'brent crude', 'oil trading',
      'legal tender', 'banknote', 'currency', 'monetary policy',
      'steel construction', 'building construction', 'road construction',
      'food recycling', 'plastic recycling', 'paper recycling', 'glass recycling', 'textile recycling',
      'wood recycling', 'cardboard recycling', 'aluminium can recycling', 'bottle recycling',
      'real estate', 'property for sale', 'apartment', 'villa for rent',
      'tyre recycl', 'tire recycl', 'battery recycl', 'e-waste', 'electronic waste', 'weee',
      'nuclear waste', 'radioactive', 'pharmaceutical waste', 'medical waste', 'clinical waste',
      'art supplies', 'art painting', 'watercolour', 'acrylic paint',
      'oil spill response', 'spill cleanup', 'spill containment', 'oil spill kit',
      'metal recycling', 'scrap metal', 'steel recycling', 'aluminium recycling', 'copper recycling',
      'ship recycling', 'shipbreaking', 'ship demolition', 'vessel scrapping',
      'vacuum pump', 'compressor', 'hydraulic equipment', 'pneumatic',
      'natural history', 'museum', 'gallery', 'auction', 'antique',
      'water treatment', 'sewage', 'wastewater', 'drinking water', 'desalination',
      'solar panel', 'wind turbine', 'electric vehicle', 'ev battery',
      'mining waste', 'construction waste', 'demolition waste', 'rubble',
      'farming', 'agriculture', 'livestock', 'poultry', 'dairy',
      'fashion', 'clothing', 'apparel', 'textile', 'garment',
      'hotel', 'restaurant', 'catering', 'hospitality',
      'recruitment', 'staffing', 'job vacancy', 'career',
      'insurance', 'mortgage', 'loan', 'credit card',
      'software development', 'mobile app', 'web design', 'seo',
      'gym', 'fitness', 'yoga', 'wellness', 'spa',
      'pet', 'veterinary', 'animal', 'dog', 'cat food',
      'furniture', 'interior design', 'home decor', 'curtain',
      'school', 'university', 'college', 'student', 'scholarship',
      'church', 'mosque', 'temple', 'charity', 'donation',
      'football', 'cricket', 'rugby', 'tennis', 'golf',
      'sneaker', 'shoe', 'footwear', 'handbag', 'luxury brand', 'watch brand',
      'smartphone', 'laptop', 'tablet', 'headphone', 'speaker', 'television',
      'grocery', 'supermarket', 'department store', 'shopping mall',
      'airline', 'flight booking', 'cruise', 'travel agency',
      'car dealership', 'car rental', 'motorcycle', 'bicycle',
      'toy', 'game', 'puzzle', 'board game', 'video game',
      'jewel', 'diamond', 'gold chain', 'necklace', 'bracelet', 'ring',
      'ship building', 'shipyard', 'vessel construction', 'marine engineering',
      'feasibility study', 'business plan template', 'how to start',
    ];
    const antiHits = ANTI_KEYWORDS.filter(ak => combinedText.includes(ak));
    if (antiHits.length > 0 && relevanceHits.length <= 1) {
      console.log(`[Radar] PRE-SCREEN REJECT: Anti-keywords detected [${antiHits.join(', ')}] — "${title.substring(0, 80)}"`);
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    if (isLikelyDirectoryPage(title, snippet, url)) {
      console.log(`[Radar] DIRECTORY PAGE detected: "${title.substring(0, 80)}" — extracting multiple companies`);
      const dirCrawl = await crawlPage(url);
      if (dirCrawl.success && dirCrawl.visibleText.length > 200) {
        const dirOilSignals = ['oil', 'lubricant', 'refin', 'recycl', 'waste', 'petroleum', 'base oil'];
        const dirContentLC = dirCrawl.visibleText.toLowerCase();
        const dirOilScore = dirOilSignals.filter(s => dirContentLC.includes(s)).length;
        if (dirOilScore < 2) {
          console.log(`[Radar] DIRECTORY SKIP: "${title.substring(0, 60)}" — crawled content not oil-relevant (score ${dirOilScore})`);
          await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
          return;
        }
        try {
          const dirIntel = await extractIntelligenceLeads(dirCrawl.visibleText.substring(0, 4000), title, url, country);
          for (const dUrl of dirIntel.directory_urls) {
            const dLC = dUrl.toLowerCase();
            if (dirOilSignals.some(s => dLC.includes(s)) || dLC.includes('member') || dLC.includes('directory')) {
              discoveredDirectoryUrls.add(dUrl); console.log(`[Radar] INTELLIGENCE from directory: Linked directory → ${dUrl}`);
            }
          }
          for (const assoc of dirIntel.association_names) {
            const aLC = assoc.toLowerCase();
            if (dirOilSignals.some(s => aLC.includes(s)) || aLC.includes('lubric')) {
              discoveredFollowUpQueries.push(`"${assoc}" members list`); console.log(`[Radar] INTELLIGENCE from directory: Oil association → ${assoc}`);
            }
          }
        } catch (e) {}
        const companies = await extractCompaniesFromDirectory(title, snippet, url, dirCrawl.visibleText);
        console.log(`[Radar] Directory yielded ${companies.length} companies from: ${url}`);
        
        for (const comp of companies) {
          if (!comp.company_name || comp.company_name.length < 3 || comp.company_type === 'not_relevant') continue;
          
          const compDomain = comp.company_website ? extractDomain(comp.company_website) : null;
          const compCountry = comp.country || country;
          
          const dupCheck = await checkDuplicate(comp.company_name, compDomain || '', compCountry);
          if (dupCheck.isDuplicate) {
            console.log(`[Radar] Directory company "${comp.company_name}" already exists — skipping`);
            continue;
          }
          
          const isoLookup: Record<string, string> = { 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Poland': 'PL', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Greece': 'GR', 'Portugal': 'PT', 'Sweden': 'SE', 'Finland': 'FI', 'Denmark': 'DK', 'Norway': 'NO', 'Turkey': 'TR', 'Brazil': 'BR', 'Mexico': 'MX', 'India': 'IN', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Russia': 'RU', 'China': 'CN', 'Japan': 'JP', 'Indonesia': 'ID', 'Nigeria': 'NG', 'South Africa': 'ZA' };
          const compIso = isoLookup[compCountry] || isoCode;
          
          const groupId = generateDomainFingerprint(comp.company_name, compDomain || '');
          
          const typeFlags = {
            handles_waste_oil: ['re_refiner', 'waste_oil_recycler', 'used_oil_collector', 'waste_management_company', 'hazardous_waste_company'].includes(comp.company_type),
            is_existing_rerefiner: comp.company_type === 're_refiner',
            is_collector_only: comp.company_type === 'used_oil_collector',
          };
          
          const scoringData = { company_type: comp.company_type, handles_waste_oil: typeFlags.handles_waste_oil, is_plant_opportunity: false, iso_code: compIso, feedstock_access_estimate: comp.company_type === 're_refiner' ? 60 : 40, capital_capability_estimate: comp.company_type === 're_refiner' ? 50 : 30, strategic_fit_estimate: comp.company_type === 're_refiner' ? 60 : 40, contactability_estimate: compDomain ? 40 : 10 };
          const scoring = calculateOpportunityScore(scoringData, false, false);
          
          await db.execute(sql`
            INSERT INTO radar_companies (canonical_name, country, iso_code, website, root_domain, user_id, status,
              company_type, company_summary, classification_confidence, overall_confidence,
              handles_waste_oil, is_existing_rerefiner, is_collector_only, is_likely_epc_target,
              opportunity_score, score_band, duplicate_group_id, evidence_summary)
            VALUES (${comp.company_name}, ${compCountry}, ${compIso}, ${comp.company_website || ''}, ${compDomain || ''},
              ${userId}, 'classified', ${comp.company_type}, ${comp.brief_description || ''},
              ${0.85}, ${0.85}, ${typeFlags.handles_waste_oil}, ${typeFlags.is_existing_rerefiner},
              ${typeFlags.is_collector_only}, ${false}, ${scoring.final}, ${scoring.band},
              ${groupId}, ${'Found via directory: ' + url})
          `);
          console.log(`[Radar] Added directory company: ${comp.company_name} (${comp.company_type}) from ${compCountry}`);
          
          if (compDomain && comp.company_website) {
            try {
              const homeCrawl = await crawlPage(comp.company_website);
              if (homeCrawl.success) {
                const detailedAi = await classifyCompanyWithAI(comp.company_name, comp.brief_description || '', comp.company_website, homeCrawl.visibleText.substring(0, 5000));
                const detailedResult = enforceClassificationConsistency(detailedAi);
                const detailedScoring = calculateOpportunityScore(detailedResult, false, false);
                await db.execute(sql`
                  UPDATE radar_companies SET company_type = ${detailedResult.company_type || comp.company_type},
                    company_summary = ${detailedResult.company_summary || comp.brief_description || ''},
                    classification_confidence = ${Number(detailedResult.classification_confidence) || 0.85},
                    overall_confidence = ${Number(detailedResult.classification_confidence) || 0.85},
                    handles_waste_oil = ${detailedResult.handles_waste_oil || typeFlags.handles_waste_oil},
                    is_existing_rerefiner = ${detailedResult.is_existing_rerefiner || typeFlags.is_existing_rerefiner},
                    is_plant_opportunity = ${detailedResult.is_plant_opportunity || false},
                    is_likely_epc_target = ${detailedResult.is_likely_epc_target || false},
                    opportunity_score = ${detailedScoring.final}, score_band = ${detailedScoring.band},
                    likely_feedstock_access = ${Number(detailedResult.feedstock_access_estimate) || 0},
                    likely_capital_capability = ${Number(detailedResult.capital_capability_estimate) || 0},
                    likely_strategic_fit = ${Number(detailedResult.strategic_fit_estimate) || 0},
                    ai_reasoning_summary = ${detailedScoring.explanation}
                  WHERE canonical_name = ${comp.company_name} AND root_domain = ${compDomain}
                `);
              }
              await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (e) {
              console.log(`[Radar] Could not crawl directory company website: ${comp.company_website}`);
            }
          }
        }
      }
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    if (isLikelyRegistryPage(title, snippet, url)) {
      console.log(`[Radar] REGISTRY PAGE detected: "${title.substring(0, 80)}" — extracting licensed operators`);
      const regCrawl = await crawlPage(url);
      if (regCrawl.success && regCrawl.visibleText.length > 200) {
        const regOilSignals = ['oil', 'lubricant', 'refin', 'recycl', 'waste', 'petroleum', 'base oil', 'hazardous'];
        const regContentLC = regCrawl.visibleText.toLowerCase();
        const regOilScore = regOilSignals.filter(s => regContentLC.includes(s)).length;
        if (regOilScore >= 2) {
          const companies = await extractCompaniesFromDirectory(title, snippet, url, regCrawl.visibleText);
          console.log(`[Radar] Registry yielded ${companies.length} companies from: ${url}`);

          for (const comp of companies) {
            if (!comp.company_name || comp.company_name.length < 3 || comp.company_type === 'not_relevant') continue;

            const compDomain = comp.company_website ? extractDomain(comp.company_website) : null;
            const compCountry = comp.country || country;
            const isoLookup: Record<string, string> = { 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Poland': 'PL', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Greece': 'GR', 'Portugal': 'PT', 'Sweden': 'SE', 'Finland': 'FI', 'Denmark': 'DK', 'Norway': 'NO', 'Turkey': 'TR', 'Brazil': 'BR', 'Mexico': 'MX', 'India': 'IN', 'Ireland': 'IE', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Russia': 'RU', 'China': 'CN', 'Japan': 'JP', 'Indonesia': 'ID', 'Nigeria': 'NG', 'South Africa': 'ZA' };
            const compIso = isoLookup[compCountry] || isoCode;

            const dupCheck = await checkDuplicate(comp.company_name, compDomain || '', compCountry);
            if (dupCheck.isDuplicate) {
              console.log(`[Radar] Registry company "${comp.company_name}" already exists — skipping`);
              continue;
            }

            const groupId = generateDomainFingerprint(comp.company_name, compDomain || '');
            const typeFlags = {
              handles_waste_oil: ['re_refiner', 'waste_oil_recycler', 'used_oil_collector', 'waste_management_company', 'hazardous_waste_company'].includes(comp.company_type),
              is_existing_rerefiner: comp.company_type === 're_refiner',
              is_collector_only: comp.company_type === 'used_oil_collector',
            };
            const scoringData = {
              company_type: comp.company_type, handles_waste_oil: typeFlags.handles_waste_oil,
              is_plant_opportunity: false, iso_code: compIso,
              feedstock_access_estimate: comp.company_type === 're_refiner' ? 70 : 50,
              capital_capability_estimate: comp.company_type === 're_refiner' ? 55 : 35,
              strategic_fit_estimate: comp.company_type === 're_refiner' ? 65 : 45,
              contactability_estimate: compDomain ? 50 : 15,
            };
            const scoring = calculateOpportunityScore(scoringData, false, false);

            try {
              await db.execute(sql`
                INSERT INTO radar_companies (canonical_name, country, iso_code, website, root_domain, user_id, status,
                  company_type, company_summary, classification_confidence, overall_confidence,
                  handles_waste_oil, is_existing_rerefiner, is_collector_only, is_likely_epc_target,
                  opportunity_score, score_band, duplicate_group_id, evidence_summary)
                VALUES (${comp.company_name}, ${compCountry}, ${compIso}, ${comp.company_website || ''}, ${compDomain || ''},
                  ${userId}, 'classified', ${comp.company_type}, ${comp.brief_description || ''},
                  ${0.92}, ${0.92}, ${typeFlags.handles_waste_oil}, ${typeFlags.is_existing_rerefiner},
                  ${typeFlags.is_collector_only}, ${false}, ${scoring.final}, ${scoring.band},
                  ${groupId}, ${'Regulatory registry: ' + url})
              `);
              console.log(`[Radar] Added registry company: ${comp.company_name} (${comp.company_type}) from ${compCountry}`);

              if (compDomain && comp.company_website) {
                try {
                  const homeCrawl = await crawlPage(comp.company_website);
                  if (homeCrawl.success) {
                    const detailedAi = await classifyCompanyWithAI(comp.company_name, comp.brief_description || '', comp.company_website, homeCrawl.visibleText.substring(0, 5000));
                    const detailedResult = enforceClassificationConsistency(detailedAi);
                    const detailedScoring = calculateOpportunityScore(detailedResult, false, false);
                    await db.execute(sql`
                      UPDATE radar_companies SET company_type = ${detailedResult.company_type || comp.company_type},
                        company_summary = ${detailedResult.company_summary || comp.brief_description || ''},
                        classification_confidence = ${Number(detailedResult.classification_confidence) || 0.92},
                        overall_confidence = ${Number(detailedResult.classification_confidence) || 0.92},
                        handles_waste_oil = ${detailedResult.handles_waste_oil || typeFlags.handles_waste_oil},
                        is_existing_rerefiner = ${detailedResult.is_existing_rerefiner || typeFlags.is_existing_rerefiner},
                        is_plant_opportunity = ${detailedResult.is_plant_opportunity || false},
                        is_likely_epc_target = ${detailedResult.is_likely_epc_target || false},
                        opportunity_score = ${detailedScoring.final}, score_band = ${detailedScoring.band},
                        likely_feedstock_access = ${Number(detailedResult.feedstock_access_estimate) || 0},
                        likely_capital_capability = ${Number(detailedResult.capital_capability_estimate) || 0},
                        likely_strategic_fit = ${Number(detailedResult.strategic_fit_estimate) || 0},
                        ai_reasoning_summary = ${detailedScoring.explanation}
                      WHERE canonical_name = ${comp.company_name} AND iso_code = ${compIso}
                    `);
                  }
                  await new Promise(resolve => setTimeout(resolve, 1500));
                } catch (e) {
                  console.log(`[Radar] Could not deep-crawl registry company: ${comp.company_website}`);
                }
              }
            } catch (insertErr: any) {
              if (insertErr.code !== '23505') console.error(`[Radar] Registry insert error:`, insertErr.message);
            }
          }
        } else {
          console.log(`[Radar] REGISTRY SKIP: "${title.substring(0, 60)}" — crawled content not oil-relevant (score ${regOilScore})`);
        }
      }
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    const isNewsSource = isNewsOrMediaDomain(sourceDomain);
    let articleContent = '';
    let companyDomain = sourceDomain;
    let companyWebsite = url;

    if (isNewsSource) {
      console.log(`[Radar] News/media source detected: ${sourceDomain} — crawling article first to extract company info`);
      const articleCrawl = await crawlPage(url);
      if (articleCrawl.success) {
        articleContent = articleCrawl.visibleText;
      }

      const preClassify = await classifyCompanyWithAI(title, snippet, url, articleContent.substring(0, 5000));

      if (preClassify.company_website) {
        try {
          const realDomain = extractDomain(preClassify.company_website);
          if (realDomain && !isNewsOrMediaDomain(realDomain)) {
            companyDomain = realDomain;
            companyWebsite = preClassify.company_website;
            console.log(`[Radar] Extracted actual company website: ${companyWebsite} (domain: ${companyDomain})`);
          }
        } catch (e) {
          console.log(`[Radar] Could not parse company_website from AI: ${preClassify.company_website}`);
        }
      }
    }

    const dupCheck = await checkDuplicate(title, companyDomain, country);
    if (dupCheck.isDuplicate) {
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    const pagesToCrawl = ['/', '/about', '/contact', '/services', '/products'];
    const baseUrl = `https://${companyDomain}`;
    let allContent = isNewsSource ? articleContent : '';
    let allEmails: string[] = [];
    let allPhones: string[] = [];
    let primaryTitle = title;
    let primaryMeta = '';

    const companyResult = await db.execute(sql`
      INSERT INTO radar_companies (canonical_name, country, iso_code, website, root_domain, user_id, status)
      VALUES (${title}, ${country}, ${isoCode}, ${companyWebsite}, ${companyDomain}, ${userId}, 'processing')
      RETURNING id
    `);
    const companyId = Number(companyResult.rows[0].id);

    if (isNewsSource) {
      await db.execute(sql`
        INSERT INTO radar_company_pages (company_id, url, page_type, title, meta_description, visible_text,
          detected_language, page_language, detected_emails_json, detected_phones_json, http_status, crawl_status, crawled_at)
        VALUES (${companyId}, ${url}, 'news_article', ${title}, ${snippet},
          ${articleContent.substring(0, 10000)}, 'en', 'en',
          '[]', '[]', 200, 'completed', NOW())
      `);
    }

    for (const page of pagesToCrawl) {
      const pageUrl = page === '/' ? baseUrl : `${baseUrl}${page}`;
      try {
        const crawlResult = await crawlPage(pageUrl);
        await db.execute(sql`
          INSERT INTO radar_company_pages (company_id, url, page_type, title, meta_description, visible_text,
            detected_language, page_language, detected_emails_json, detected_phones_json, http_status, crawl_status, crawled_at)
          VALUES (${companyId}, ${pageUrl}, ${page.replace('/', '') || 'homepage'}, ${crawlResult.title}, ${crawlResult.metaDescription},
            ${crawlResult.visibleText}, ${crawlResult.language}, ${crawlResult.language},
            ${JSON.stringify(crawlResult.emails)}, ${JSON.stringify(crawlResult.phones)},
            ${crawlResult.httpStatus}, ${crawlResult.success ? 'completed' : 'failed'}, NOW())
        `);

        if (crawlResult.success) {
          allContent += ` ${crawlResult.visibleText}`;
          allEmails.push(...crawlResult.emails);
          allPhones.push(...crawlResult.phones);
          if (page === '/') {
            primaryTitle = crawlResult.title || title;
            primaryMeta = crawlResult.metaDescription;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error(`Crawl error for ${pageUrl}:`, err);
      }
    }

    allEmails = [...new Set(allEmails)];
    allPhones = [...new Set(allPhones)];

    const oilIndustrySignals = ['oil', 'lubricant', 'base oil', 'waste oil', 'used oil', 'refin', 're-refin', 'rerefin', 'recycl', 'regenerat', 'petroleum'];
    const contentLC = allContent.toLowerCase();
    const oilRelevanceScore = oilIndustrySignals.filter(s => contentLC.includes(s)).length;

    if (allContent.length > 500 && oilRelevanceScore >= 3) {
      try {
        const intel = await extractIntelligenceLeads(allContent.substring(0, 4000), primaryTitle, url, country);
        for (const dirUrl of intel.directory_urls) {
          const dirLC = dirUrl.toLowerCase();
          const dirRelevant = oilIndustrySignals.some(s => dirLC.includes(s)) || dirLC.includes('member') || dirLC.includes('directory');
          if (dirRelevant && !discoveredDirectoryUrls.has(dirUrl)) {
            discoveredDirectoryUrls.add(dirUrl);
            console.log(`[Radar] INTELLIGENCE: Discovered directory URL → ${dirUrl}`);
          }
        }
        for (const q of intel.follow_up_queries) {
          const qLC = q.toLowerCase();
          if (oilIndustrySignals.some(s => qLC.includes(s))) {
            discoveredFollowUpQueries.push(q);
            console.log(`[Radar] INTELLIGENCE: Follow-up query → "${q.substring(0, 60)}"`);
          }
        }
        for (const assoc of intel.association_names) {
          const assocLC = assoc.toLowerCase();
          const isOilRelevant = oilIndustrySignals.some(s => assocLC.includes(s)) || assocLC.includes('lubric') || assocLC.includes('fuel') || assocLC.includes('geir') || assocLC.includes('ora');
          if (isOilRelevant) {
            discoveredFollowUpQueries.push(`"${assoc}" members list`);
            console.log(`[Radar] INTELLIGENCE: Oil-relevant association → ${assoc} — queued search`);
          }
        }
        for (const compName of intel.competitor_names) {
          const nameLC = compName.toLowerCase();
          const isOilComp = oilIndustrySignals.some(s => nameLC.includes(s)) || nameLC.includes('fuel') || nameLC.includes('lubric');
          if (isOilComp) {
            discoveredFollowUpQueries.push(`"${compName}" waste oil`);
            console.log(`[Radar] INTELLIGENCE: Oil-relevant competitor → ${compName} — queued search`);
          }
        }
      } catch (intelErr) {
        console.log(`[Radar] Intelligence extraction skipped for ${url}`);
      }
    }

    let aiResult = await classifyCompanyWithAI(
      primaryTitle, snippet || primaryMeta, url,
      allContent.substring(0, 5000)
    );

    aiResult = enforceClassificationConsistency(aiResult);

    if (aiResult.company_website && !isNewsSource) {
      try {
        const aiDomain = extractDomain(aiResult.company_website);
        if (aiDomain && aiDomain !== companyDomain && !isNewsOrMediaDomain(aiDomain)) {
          companyDomain = aiDomain;
          companyWebsite = aiResult.company_website;
          console.log(`[Radar] AI suggested different company domain: ${companyDomain}`);
        }
      } catch (e) {}
    }

    const resolvedName = aiResult.company_name || title;
    const postAiDup = await checkDuplicate(resolvedName, companyDomain, country);
    if (postAiDup.isDuplicate && postAiDup.duplicateOfId !== companyId) {
      console.log(`[Radar] POST-AI DUPLICATE: "${resolvedName}" (${companyDomain}) matches existing ID ${postAiDup.duplicateOfId} — merging contacts`);
      for (const email of allEmails) {
        const contactType = email.includes('info@') || email.includes('contact@') ? 'generic' :
          email.includes('sales') ? 'sales' : email.includes('project') ? 'projects' : 'unknown';
        await db.execute(sql`
          INSERT INTO radar_contacts (company_id, email, contact_type, source_url, confidence)
          SELECT ${postAiDup.duplicateOfId}, ${email}, ${contactType}, ${url}, ${0.6}
          WHERE NOT EXISTS (SELECT 1 FROM radar_contacts WHERE company_id = ${postAiDup.duplicateOfId} AND email = ${email})
        `);
      }
      await db.execute(sql`DELETE FROM radar_companies WHERE id = ${companyId}`);
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }

    const hasContacts = allEmails.length > 0 || allPhones.length > 0;
    const hasProjects = (aiResult.project_signals || []).length > 0;
    const scoring = calculateOpportunityScore(aiResult, hasContacts, hasProjects);

    const groupId = generateDomainFingerprint(resolvedName, companyDomain);

    let companyName = (aiResult.company_name || title)
      .replace(/\s*[-–|:]\s*(Home|Homepage|Official Site|Official Website|Home Page|Welcome|About Us|Contact Us|Services)$/i, '')
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s*[-–]\s*(British|UK|United Kingdom|England|Scotland|Wales)$/i, '')
      .trim();
    if (companyName.length > 80) companyName = companyName.substring(0, 80).trim();
    const invalidNames = ['unknown', 'unclear', 'n/a', 'none', 'not found', 'not available', 'unnamed', 'descargar', 'download'];
    const KNOWN_JUNK_BRANDS = [
      'nike', 'adidas', 'puma', 'dyson', 'philips', 'samsung', 'sony', 'lg', 'panasonic',
      'amazon', 'ikea', 'zara', 'gucci', 'prada', 'chanel', 'dior', 'hermes', 'burberry',
      'louis vuitton', 'ferrari', 'lamborghini', 'porsche', 'bentley', 'rolls royce', 'rolls-royce',
      'jaguar', 'land rover', 'bmw', 'mercedes', 'audi', 'volkswagen', 'volvo', 'ford',
      'clarins', 'ysl', 'kiehl', 'estee lauder', 'lancome', 'bobbi brown', 'mac cosmetics',
      'nars', 'clinique', 'loreal', "l'oreal", 'maybelline', 'revlon', 'sephora',
      'starbucks', 'mcdonalds', "mcdonald's", 'kfc', 'subway', 'coca-cola', 'pepsi',
      'apple', 'google', 'microsoft', 'oracle', 'facebook', 'meta', 'twitter',
      'walmart', 'ebay', 'alibaba', 'temu', 'shein',
      'grant thornton', 'kpmg', 'deloitte', 'ernst & young', 'pwc', 'accenture', 'mckinsey',
      'air liquide', 'caterpillar', 'siemens', 'abb', 'honeywell', 'emerson', '3m',
      'roxtec', 'eagleburgmann', 'glomacs', 'timberland', 'gold apple',
      'pennzoil', 'castrol', 'mobil', 'valvoline', 'shell', 'bp', 'exxonmobil',
      'total energies', 'totalenergies', 'chevron', 'sinopec', 'petrochina',
      'fuchs', 'motul', 'liqui moly', 'liqui-moly', 'amsoil', 'royal purple',
      'saudi aramco', 'aramco', 'adnoc', 'petronas', 'petrobras', 'repsol', 'eni',
      'caltex', 'lukoil', 'gazprom', 'idemitsu', 'cosmo oil',
    ];
    const nameLC = companyName.toLowerCase().trim();
    const isKnownJunk = KNOWN_JUNK_BRANDS.some(brand => nameLC === brand || nameLC.startsWith(brand + ' ') || nameLC.endsWith(' ' + brand) || nameLC.includes(brand + '-'));
    if (isKnownJunk) {
      console.log(`[Radar] POST-AI JUNK: Known non-industry brand "${companyName}" — marking not_relevant`);
      await db.execute(sql`
        UPDATE radar_companies SET company_type = 'not_relevant', opportunity_score = 0, score_band = 'low',
        canonical_name = ${companyName}, status = 'classified', updated_at = NOW() WHERE id = ${companyId}
      `);
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
      return;
    }
    if (invalidNames.includes(nameLC) || companyName.length < 3) {
      console.log(`[Radar] Skipping result with invalid company name: "${companyName}"`);
      await db.execute(sql`
        UPDATE radar_companies SET company_type = 'not_relevant', opportunity_score = 0, score_band = 'low',
        status = 'classified', updated_at = NOW() WHERE id = ${companyId}
      `);
      return;
    }

    if (companyDomain && (companyDomain.endsWith('.gob.mx') || companyDomain.endsWith('.gov.br') || 
        companyDomain.endsWith('.gov.in') || companyDomain.endsWith('.gov.ae') || companyDomain.endsWith('.go.id') ||
        companyDomain.endsWith('.gouv.fr') || companyDomain.endsWith('.bund.de')) &&
        aiResult.company_type !== 'not_relevant') {
      const govKeywords = ['secretaría', 'secretaria', 'ministerio', 'ministry', 'gobierno', 'government', 'instituto', 'comisión', 'department'];
      const nameLC = companyName.toLowerCase();
      if (govKeywords.some(kw => nameLC.includes(kw)) || companyName.startsWith('Ley ') || companyName.startsWith('PAPSRME')) {
        console.log(`[Radar] Skipping government entity: "${companyName}" (${companyDomain})`);
        await db.execute(sql`
          UPDATE radar_companies SET company_type = 'not_relevant', opportunity_score = 0, score_band = 'low',
          canonical_name = ${companyName}, status = 'classified', updated_at = NOW() WHERE id = ${companyId}
        `);
        return;
      }
    }

    await db.execute(sql`
      UPDATE radar_companies SET
        canonical_name = ${companyName},
        company_type = ${aiResult.company_type || 'unclear'},
        company_summary = ${aiResult.company_summary || ''},
        website = ${companyWebsite},
        root_domain = ${companyDomain},
        likely_feedstock_access = ${Number(aiResult.feedstock_access_estimate) || 0},
        likely_capital_capability = ${Number(aiResult.capital_capability_estimate) || 0},
        likely_strategic_fit = ${Number(aiResult.strategic_fit_estimate) || 0},
        opportunity_score = ${scoring.final},
        overall_confidence = ${Number(aiResult.classification_confidence) || 0},
        classification_confidence = ${Number(aiResult.classification_confidence) || 0},
        contact_confidence = ${hasContacts ? 0.7 : 0.1},
        score_band = ${scoring.band},
        ai_reasoning_summary = ${scoring.explanation},
        evidence_summary = ${aiResult.classification_evidence || ''},
        handles_waste_oil = ${aiResult.handles_waste_oil || false},
        is_plant_opportunity = ${aiResult.is_plant_opportunity || false},
        is_existing_rerefiner = ${aiResult.is_existing_rerefiner || false},
        is_collector_only = ${aiResult.is_collector_only || false},
        is_likely_epc_target = ${aiResult.is_likely_epc_target || false},
        duplicate_group_id = ${groupId},
        status = 'classified',
        updated_at = NOW()
      WHERE id = ${companyId}
    `);

    await db.execute(sql`
      INSERT INTO radar_scores (company_id, feedstock_access_score, capital_capability_score, strategic_fit_score,
        project_signal_score, geography_score, contactability_score, final_score, score_band, explanation)
      VALUES (${companyId}, ${scoring.components.feedstock_access}, ${scoring.components.capital_capability},
        ${scoring.components.strategic_fit}, ${scoring.components.project_signal},
        ${scoring.components.geography}, ${scoring.components.contactability},
        ${scoring.final}, ${scoring.band}, ${scoring.explanation})
    `);

    await db.execute(sql`
      INSERT INTO radar_sources (source_type, source_name, title, source_url, domain, country, iso_code, raw_snippet, search_job_id)
      VALUES ('search_result', ${companyDomain}, ${title}, ${url}, ${companyDomain}, ${country}, ${isoCode}, ${snippet || ''}, ${searchJobId})
    `);

    const compType = aiResult.company_type || 'unclear';
    if (compType !== 'not_relevant') {
      for (const email of allEmails) {
        const contactType = email.includes('info@') || email.includes('contact@') ? 'generic' :
          email.includes('sales') ? 'sales' : email.includes('project') ? 'projects' : 'unknown';
        await db.execute(sql`
          INSERT INTO radar_contacts (company_id, email, contact_type, source_url, confidence)
          VALUES (${companyId}, ${email}, ${contactType}, ${url}, ${0.6})
        `);
      }
      for (const phone of allPhones) {
        await db.execute(sql`
          INSERT INTO radar_contacts (company_id, phone, contact_type, source_url, confidence)
          VALUES (${companyId}, ${phone}, 'generic', ${url}, ${0.5})
        `);
      }
    }

    for (const signal of (aiResult.project_signals || [])) {
      if (signal.confidence > 0.3) {
        const projectResult = await db.execute(sql`
          INSERT INTO radar_projects (company_id, country, iso_code, project_name, project_type, project_summary,
            source_url, evidence_text, urgency, project_confidence, status)
          VALUES (${companyId}, ${country}, ${isoCode}, ${signal.summary || 'Detected signal'}, ${signal.type || 'weak_signal'},
            ${signal.summary || ''}, ${url}, ${signal.evidence || ''}, ${aiResult.urgency || 'medium'},
            ${Number(signal.confidence) || 0}, 'new')
          RETURNING id
        `);

        const relevantTypes = ['re_refiner', 'waste_oil_recycler', 'base_oil_company', 'used_oil_collector'];
        const isHighValueType = ['re_refiner', 'waste_oil_recycler', 'base_oil_company'].includes(compType);
        const isRelevantCompany = relevantTypes.includes(compType) && scoring.final >= 35;
        const isHighValueSignal = ['tender', 'permit_stage', 'expansion', 'new_plant', 'upgrade_modernization', 'investment_signal'].includes(signal.type);
        
        if (Number(signal.confidence) > 0.7 && isRelevantCompany && isHighValueSignal) {
          const alertPriority = (isHighValueType && scoring.final >= 60) ? 'critical' :
            (scoring.final >= 45) ? 'high' : 'watch';
          await createAlert('new_project_signal', alertPriority,
            `Project signal: ${signal.type} - ${aiResult.company_name || title} (Score: ${scoring.final})`,
            signal.summary || '', companyId, Number(projectResult.rows[0]?.id), country, url);
        }
      }
    }

    if (scoring.final >= 70 && compType !== 'not_relevant' && compType !== 'unclear') {
      const alertPriority = scoring.final >= 80 ? 'critical' : 'high';
      await createAlert('score_threshold', alertPriority,
        `Hot opportunity: ${aiResult.company_name || title} (Score: ${scoring.final})`,
        `${scoring.band} opportunity in ${country}. ${scoring.explanation}`,
        companyId, undefined, country, url);
    }

    await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${searchResultId}`);
    await updateCountryIntelligence(isoCode);

  } catch (error) {
    console.error(`Error processing result:`, error);
  }
}

async function extractIntelligenceLeads(
  crawledContent: string, title: string, url: string, country: string
): Promise<{ directory_urls: string[]; association_names: string[]; competitor_names: string[]; follow_up_queries: string[] }> {
  try {
    const prompt = `You are an intelligence analyst specializing in the waste oil recycling and re-refining industry.

Analyze this crawled page content and extract INTELLIGENCE LEADS — clues that point to MORE companies, associations, directories, or registries.

Page Title: ${title}
URL: ${url}
Target Country: ${country}
Content (first 4000 chars): ${crawledContent.substring(0, 4000)}

Extract:
1. directory_urls: Any URLs on this page that appear to be DIRECTORIES, MEMBER LISTS, ASSOCIATION PAGES, or REGISTRIES listing multiple companies in the oil recycling/re-refining/waste management industry. Look for links containing words like "members", "directory", "list", "association", "registry", "approved", "licensed".
2. association_names: Names of INDUSTRY ASSOCIATIONS, REGULATORY BODIES, or TRADE ORGANIZATIONS mentioned (e.g., "GEIR", "UKLA", "NAICS", environmental agencies with company registers). Only include ones relevant to waste oil/recycling/re-refining.
3. competitor_names: Names of SPECIFIC COMPANIES mentioned on this page that are in the waste oil/base oil/re-refining sector that we should investigate.
4. follow_up_queries: Suggested Google search queries (max 3) that would help find MORE companies in this sector based on what you learned from this page. Be specific and creative — use industry terms, regulatory frameworks, or association names found on the page.

IMPORTANT: Only include items genuinely related to waste oil, used oil, base oil, lubricant recycling, or re-refining. NOT cooking oil, automotive parts, general waste.

Respond with JSON:
{
  "directory_urls": ["https://..."],
  "association_names": ["..."],
  "competitor_names": ["..."],
  "follow_up_queries": ["..."]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an industry intelligence analyst. Extract leads for discovering more companies. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      directory_urls: (result.directory_urls || []).filter((u: string) => u.startsWith('http')),
      association_names: result.association_names || [],
      competitor_names: result.competitor_names || [],
      follow_up_queries: result.follow_up_queries || [],
    };
  } catch (error) {
    console.error('[Radar] Intelligence extraction error:', error);
    return { directory_urls: [], association_names: [], competitor_names: [], follow_up_queries: [] };
  }
}

const discoveredDirectoryUrls = new Set<string>();
const discoveredFollowUpQueries: string[] = [];

async function runAdaptiveFollowUp(userId: number, country: string, isoCode: string, language: string): Promise<number> {
  let totalAdded = 0;

  try {
    const existingCompanies = await db.execute(sql`
      SELECT canonical_name, company_type, root_domain, evidence_summary
      FROM radar_companies
      WHERE country = ${country} AND company_type != 'not_relevant' AND company_type != 'unclear'
      ORDER BY opportunity_score DESC
      LIMIT 20
    `);

    const companyContext = existingCompanies.rows.map((r: any) =>
      `${r.canonical_name} (${r.company_type}, domain: ${r.root_domain})`
    ).join('; ');

    const allFollowUps = [...discoveredFollowUpQueries];

    if (companyContext.length > 10) {
      try {
        const followUpPrompt = `You are an expert at finding waste oil recycling and re-refining companies.

Country: ${country}
Companies found so far: ${companyContext}

Generate 8-10 HIGHLY SPECIFIC Google search queries to find ADDITIONAL waste oil / used oil / base oil companies we MISSED.

RULES:
- Every query MUST contain at least one of: "waste oil", "used oil", "base oil", "re-refin", "oil recycl", "lubricant recycl"
- DO NOT generate generic queries like "waste oil recycling companies ${country}" — those were already searched
- DO NOT generate queries about associations, regulations, or policies — focus on COMPANY discovery
- Target SPECIFIC niches and angles:
  * Site-specific searches: site:ora.org.uk, site:ukla.org.uk, site:geir-rerefining.org
  * Named company searches: "${(existingCompanies.rows[0] as any)?.canonical_name || 'company'}" competitor waste oil
  * Region-specific: "waste oil collection [specific city/region in ${country}]"
  * Supply chain: "waste oil supplier to" OR "base oil buyer" ${country}
  * Permit/license registries: "waste oil permit holder" OR "oil recycling license" ${country}
  * News/acquisitions: "acquires waste oil" OR "new oil re-refinery" ${country}
  * Trade show exhibitors: "IFAT exhibitor waste oil" OR "Ecomondo exhibitor base oil"
  * LinkedIn style: "waste oil re-refinery" "${country}" -linkedin

IMPORTANT: Each query should explore a DIFFERENT angle. No two queries should be semantically similar.

Respond with JSON: { "queries": ["query1", "query2", ...] }`;

        const followUpResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a competitive intelligence specialist. Generate targeted search queries to find undiscovered companies. Always respond with valid JSON." },
            { role: "user", content: followUpPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
          max_tokens: 800,
        });

        const followUpResult = JSON.parse(followUpResponse.choices[0].message.content || '{}');
        const aiQueries = followUpResult.queries || [];
        allFollowUps.push(...aiQueries);
        console.log(`[Radar] AI generated ${aiQueries.length} adaptive follow-up queries for ${country}`);
      } catch (err) {
        console.error('[Radar] AI follow-up query generation error:', err);
      }
    }

    const oilTerms = ['oil', 'lubricant', 'refin', 'base oil', 'petroleum', 'grease'];
    const oilRelevantFollowUps = allFollowUps.filter(q => {
      const qLC = q.toLowerCase();
      return oilTerms.some(t => qLC.includes(t));
    });
    
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const q of oilRelevantFollowUps) {
      const normalized = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduped.push(q);
      }
    }
    const uniqueFollowUps = deduped.slice(0, 12);
    console.log(`[Radar] Running ${uniqueFollowUps.length} adaptive follow-up queries for ${country} (filtered from ${allFollowUps.length} total)`);

    for (const query of uniqueFollowUps) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM radar_search_jobs WHERE query = ${query} AND country = ${country} LIMIT 1
        `);
        if (existing.rows.length > 0) {
          console.log(`[Radar] Skipping duplicate follow-up query: "${query.substring(0, 60)}"`);
          continue;
        }

        const jobResult = await db.execute(sql`
          INSERT INTO radar_search_jobs (country, iso_code, language, query, query_family, source_class, status, user_id, started_at)
          VALUES (${country}, ${isoCode}, 'en', ${query}, 'adaptive_followup', 'ai_generated', 'running', ${userId}, NOW())
          RETURNING id
        `);
        const jobId = Number(jobResult.rows[0].id);

        try {
          const searchData = await executeGoogleSearch(query, isoCode);
          const items = searchData.items || [];
          let count = 0;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.link || item.link.toLowerCase().endsWith('.pdf')) continue;

            const fingerprint = crypto.createHash('sha256').update(`${item.title}|${item.link}`).digest('hex').substring(0, 64);
            try {
              const existingResult = await db.execute(sql`
                SELECT id FROM radar_search_results WHERE content_fingerprint = ${fingerprint} LIMIT 1
              `);
              if (existingResult.rows.length > 0) continue;

              const srResult = await db.execute(sql`
                INSERT INTO radar_search_results (search_job_id, title, url, snippet, domain, rank, content_fingerprint)
                VALUES (${jobId}, ${item.title || ''}, ${item.link}, ${item.snippet || ''}, ${extractDomain(item.link)}, ${i + 1}, ${fingerprint})
                RETURNING id
              `);
              count++;
              totalAdded++;

              processDiscoveryResult(userId, jobId, Number(srResult.rows[0].id),
                item.title || '', item.snippet || '', item.link, country, isoCode
              ).catch(err => console.error('Follow-up process error:', err));

            } catch (err: any) {
              if (err.code === '23505') continue;
            }
          }

          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'completed', results_count = ${count}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
          console.log(`[Radar] Follow-up query "${query.substring(0, 50)}..." yielded ${count} new results`);
        } catch (searchError: any) {
          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'failed', error_message = ${searchError.message || 'Search failed'}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[Radar] Follow-up query error:`, err);
      }
    }
  } catch (error) {
    console.error('[Radar] Adaptive follow-up error:', error);
  }

  return totalAdded;
}

async function crawlDiscoveredDirectories(userId: number, country: string, isoCode: string): Promise<number> {
  let totalAdded = 0;
  const urlsToCrawl = [...discoveredDirectoryUrls];

  if (urlsToCrawl.length === 0) {
    console.log(`[Radar] No AI-discovered directories to crawl for ${country}`);
    return 0;
  }

  console.log(`[Radar] Crawling ${urlsToCrawl.length} AI-discovered directories for ${country}`);

  const isoLookup: Record<string, string> = { 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Poland': 'PL', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Greece': 'GR', 'Portugal': 'PT', 'Sweden': 'SE', 'Finland': 'FI', 'Denmark': 'DK', 'Norway': 'NO', 'Turkey': 'TR', 'Brazil': 'BR', 'Mexico': 'MX', 'India': 'IN', 'Ireland': 'IE', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Russia': 'RU', 'China': 'CN', 'Japan': 'JP', 'Indonesia': 'ID', 'Nigeria': 'NG', 'South Africa': 'ZA' };

  for (const dirUrl of urlsToCrawl.slice(0, 8)) {
    try {
      console.log(`[Radar] Crawling discovered directory: ${dirUrl}`);
      const dirCrawl = await crawlPage(dirUrl);
      if (!dirCrawl.success || dirCrawl.visibleText.length < 200) {
        console.log(`[Radar] Directory crawl failed or too short: ${dirUrl}`);
        continue;
      }

      const companies = await extractCompaniesFromDirectory(dirCrawl.title || '', '', dirUrl, dirCrawl.visibleText);
      console.log(`[Radar] Discovered directory yielded ${companies.length} companies from: ${dirUrl}`);

      for (const comp of companies) {
        if (!comp.company_name || comp.company_name.length < 3 || comp.company_type === 'not_relevant') continue;

        const compDomain = comp.company_website ? extractDomain(comp.company_website) : null;
        const compCountry = comp.country || country;
        const compIso = isoLookup[compCountry] || isoCode;

        const dupCheck = await checkDuplicate(comp.company_name, compDomain || '', compCountry);
        if (dupCheck.isDuplicate) {
          console.log(`[Radar] Discovered directory company "${comp.company_name}" already exists — skipping`);
          continue;
        }

        const groupId = generateDomainFingerprint(comp.company_name, compDomain || '');
        const typeFlags = {
          handles_waste_oil: ['re_refiner', 'waste_oil_recycler', 'used_oil_collector', 'waste_management_company', 'hazardous_waste_company'].includes(comp.company_type),
          is_existing_rerefiner: comp.company_type === 're_refiner',
          is_collector_only: comp.company_type === 'used_oil_collector',
        };
        const scoringData = { company_type: comp.company_type, handles_waste_oil: typeFlags.handles_waste_oil, is_plant_opportunity: false, iso_code: compIso, feedstock_access_estimate: comp.company_type === 're_refiner' ? 60 : 40, capital_capability_estimate: comp.company_type === 're_refiner' ? 50 : 30, strategic_fit_estimate: comp.company_type === 're_refiner' ? 60 : 40, contactability_estimate: compDomain ? 40 : 10 };
        const scoring = calculateOpportunityScore(scoringData, false, false);

        await db.execute(sql`
          INSERT INTO radar_companies (canonical_name, country, iso_code, website, root_domain, user_id, status,
            company_type, company_summary, classification_confidence, overall_confidence,
            handles_waste_oil, is_existing_rerefiner, is_collector_only, is_likely_epc_target,
            opportunity_score, score_band, duplicate_group_id, evidence_summary)
          VALUES (${comp.company_name}, ${compCountry}, ${compIso}, ${comp.company_website || ''}, ${compDomain || ''},
            ${userId}, 'classified', ${comp.company_type}, ${comp.brief_description || ''},
            ${0.85}, ${0.85}, ${typeFlags.handles_waste_oil}, ${typeFlags.is_existing_rerefiner},
            ${typeFlags.is_collector_only}, ${false}, ${scoring.final}, ${scoring.band},
            ${groupId}, ${'AI-discovered directory: ' + dirUrl})
        `);
        console.log(`[Radar] Added from AI-discovered directory: ${comp.company_name} (${comp.company_type}) — ${compCountry}`);
        totalAdded++;

        if (compDomain && comp.company_website) {
          try {
            const homeCrawl = await crawlPage(comp.company_website);
            if (homeCrawl.success) {
              const detailedAi = await classifyCompanyWithAI(comp.company_name, comp.brief_description || '', comp.company_website, homeCrawl.visibleText.substring(0, 5000));
              const detailedResult = enforceClassificationConsistency(detailedAi);
              const detailedScoring = calculateOpportunityScore(detailedResult, false, false);
              await db.execute(sql`
                UPDATE radar_companies SET company_type = ${detailedResult.company_type || comp.company_type},
                  company_summary = ${detailedResult.company_summary || comp.brief_description || ''},
                  classification_confidence = ${Number(detailedResult.classification_confidence) || 0.85},
                  overall_confidence = ${Number(detailedResult.classification_confidence) || 0.85},
                  handles_waste_oil = ${detailedResult.handles_waste_oil || typeFlags.handles_waste_oil},
                  is_existing_rerefiner = ${detailedResult.is_existing_rerefiner || typeFlags.is_existing_rerefiner},
                  is_plant_opportunity = ${detailedResult.is_plant_opportunity || false},
                  is_likely_epc_target = ${detailedResult.is_likely_epc_target || false},
                  opportunity_score = ${detailedScoring.final}, score_band = ${detailedScoring.band},
                  likely_feedstock_access = ${Number(detailedResult.feedstock_access_estimate) || 0},
                  likely_capital_capability = ${Number(detailedResult.capital_capability_estimate) || 0},
                  likely_strategic_fit = ${Number(detailedResult.strategic_fit_estimate) || 0},
                  ai_reasoning_summary = ${detailedScoring.explanation}
                WHERE canonical_name = ${comp.company_name} AND root_domain = ${compDomain}
              `);
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (e) {
            console.log(`[Radar] Could not deep-crawl discovered directory company: ${comp.company_website}`);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`[Radar] Error crawling discovered directory ${dirUrl}:`, err);
    }
  }

  discoveredDirectoryUrls.clear();
  discoveredFollowUpQueries.length = 0;
  return totalAdded;
}

const SEED_DIRECTORY_URLS: { url: string; title: string; description: string }[] = [
  {
    url: 'https://www.geir-rerefining.org/about-us/members/',
    title: 'GEIR Members - European Re-Refining Industry',
    description: 'Official member list of the European re-refining industry association (GEIR). Lists all major European re-refiners.',
  },
  {
    url: 'https://www.ueil.org/about-us/structure/geir/',
    title: 'GEIR - UEIL European Lubricant Industry',
    description: 'European lubricant industry information about GEIR re-refining members.',
  },
];

async function injectSeedDirectories(userId: number, country: string, isoCode: string): Promise<number> {
  let added = 0;
  for (const seed of SEED_DIRECTORY_URLS) {
    try {
      const fingerprint = crypto.createHash('sha256').update(`seed|${seed.url}`).digest('hex').substring(0, 64);
      const existing = await db.execute(sql`
        SELECT id FROM radar_search_results WHERE content_fingerprint = ${fingerprint} LIMIT 1
      `);
      if (existing.rows.length > 0) {
        console.log(`[Radar] Seed URL already processed: ${seed.url}`);
        continue;
      }

      const jobResult = await db.execute(sql`
        INSERT INTO radar_search_jobs (country, iso_code, language, query, query_family, source_class, status, user_id, started_at)
        VALUES (${country}, ${isoCode}, 'en', ${'[SEED] ' + seed.title}, 'directory_mining', 'seed_directory', 'running', ${userId}, NOW())
        RETURNING id
      `);
      const jobId = Number(jobResult.rows[0].id);

      const srResult = await db.execute(sql`
        INSERT INTO radar_search_results (search_job_id, title, url, snippet, domain, rank, content_fingerprint)
        VALUES (${jobId}, ${seed.title}, ${seed.url}, ${seed.description}, ${extractDomain(seed.url)}, ${1}, ${fingerprint})
        RETURNING id
      `);

      console.log(`[Radar] SEED: Crawling directory ${seed.url}`);
      let crawledContent = '';
      try {
        const response = await fetch(seed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          const html = await response.text();
          crawledContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);
        }
      } catch (crawlErr) {
        console.log(`[Radar] SEED: Failed to crawl ${seed.url}`);
      }

      if (crawledContent.length > 100) {
        const companies = await extractCompaniesFromDirectory(seed.title, seed.description, seed.url, crawledContent);
        console.log(`[Radar] SEED: Extracted ${companies.length} companies from ${seed.url}`);

        for (const comp of companies) {
          if (!comp.company_name || comp.company_type === 'not_relevant') continue;
          const compDomain = comp.company_website ? extractDomain(comp.company_website) : null;
          const compCountry = comp.country || country;

          const dupCheck = await checkDuplicate(comp.company_name, compDomain || '', compCountry);
          if (dupCheck.isDuplicate) {
            console.log(`[Radar] SEED: Skip duplicate ${comp.company_name}`);
            continue;
          }

          const groupId = generateDomainFingerprint(comp.company_name, compDomain || '');
          const scoring = calculateOpportunityScore({
            ...comp,
            feedstock_access_estimate: comp.company_type === 're_refiner' ? 70 : 50,
            capital_capability_estimate: 50,
            strategic_fit_estimate: comp.company_type === 're_refiner' ? 80 : 60,
            classification_confidence: 0.90,
            handles_waste_oil: true,
          }, false, false);

          try {
            await db.execute(sql`
              INSERT INTO radar_companies (
                canonical_name, country, iso_code, website, root_domain,
                company_type, company_summary, overall_confidence,
                opportunity_score, score_band,
                duplicate_group_id, status, user_id
              ) VALUES (
                ${comp.company_name}, ${compCountry}, ${isoCode},
                ${comp.company_website || ''}, ${compDomain || ''},
                ${comp.company_type}, ${comp.brief_description || ''},
                ${0.90}, ${scoring.final}, ${scoring.band},
                ${groupId}, 'classified', ${userId}
              )
            `);
            added++;
            console.log(`[Radar] SEED: Added ${comp.company_name} (${comp.company_type}) from ${seed.url}`);
          } catch (insertErr: any) {
            if (insertErr.code !== '23505') console.error(`[Radar] SEED insert error:`, insertErr.message);
          }
        }
      }

      await db.execute(sql`
        UPDATE radar_search_jobs SET status = 'completed', results_count = ${added}, completed_at = NOW()
        WHERE id = ${jobId}
      `);
      await db.execute(sql`UPDATE radar_search_results SET processed = TRUE WHERE id = ${Number(srResult.rows[0].id)}`);

    } catch (err) {
      console.error(`[Radar] SEED error for ${seed.url}:`, err);
    }
  }
  console.log(`[Radar] SEED: Total ${added} companies added from seed directories`);
  return added;
}

async function runRegulatoryRegistryMining(userId: number, country: string, isoCode: string, language: string): Promise<number> {
  let totalAdded = 0;
  try {
    const registryQueries: string[] = [];
    const enRegQueries = MULTILINGUAL_QUERIES.en?.regulatory_registry || [];
    for (const q of enRegQueries.slice(0, 4)) {
      registryQueries.push(`${q} ${country}`);
    }
    if (language !== 'en') {
      const localRegQueries = MULTILINGUAL_QUERIES[language]?.regulatory_registry || [];
      for (const q of localRegQueries.slice(0, 4)) {
        registryQueries.push(`${q} ${country}`);
      }
    }

    registryQueries.push(
      `site:gov.* "waste oil" OR "used oil" license register ${country}`,
      `"approved" OR "authorized" "waste oil" operator list ${country}`,
      `environmental agency "waste oil" registered carriers ${country}`,
    );

    const seen = new Set<string>();
    const uniqueQueries = registryQueries.filter(q => {
      const norm = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    console.log(`[Radar] Phase 4: Running ${uniqueQueries.length} regulatory registry queries for ${country}`);

    for (const query of uniqueQueries) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM radar_search_jobs WHERE query = ${query} AND country = ${country} LIMIT 1
        `);
        if (existing.rows.length > 0) continue;

        const jobResult = await db.execute(sql`
          INSERT INTO radar_search_jobs (country, iso_code, language, query, query_family, source_class, status, user_id, started_at)
          VALUES (${country}, ${isoCode}, 'en', ${query}, 'regulatory_registry', 'regulatory_registry', 'running', ${userId}, NOW())
          RETURNING id
        `);
        const jobId = Number(jobResult.rows[0].id);

        try {
          const searchData = await executeGoogleSearch(query, isoCode);
          const items = searchData.items || [];
          let count = 0;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.link || item.link.toLowerCase().endsWith('.pdf')) continue;

            const fingerprint = crypto.createHash('sha256').update(`${item.title}|${item.link}`).digest('hex').substring(0, 64);
            try {
              const existingResult = await db.execute(sql`
                SELECT id FROM radar_search_results WHERE content_fingerprint = ${fingerprint} LIMIT 1
              `);
              if (existingResult.rows.length > 0) continue;

              const isRegistry = isLikelyRegistryPage(item.title || '', item.snippet || '', item.link);
              const isDirectory = isLikelyDirectoryPage(item.title || '', item.snippet || '', item.link);

              if (isRegistry || isDirectory) {
                const regCrawl = await crawlPage(item.link);
                if (regCrawl.success && regCrawl.visibleText.length > 200) {
                  const companies = await extractCompaniesFromDirectory(
                    item.title || '', item.snippet || '', item.link, regCrawl.visibleText
                  );
                  console.log(`[Radar] Registry mining: ${companies.length} companies from ${item.link}`);

                  for (const comp of companies) {
                    if (!comp.company_name || comp.company_name.length < 3 || comp.company_type === 'not_relevant') continue;

                    const compDomain = comp.company_website ? extractDomain(comp.company_website) : null;
                    const compCountry = comp.country || country;
                    const isoLookup: Record<string, string> = { 'United Kingdom': 'GB', 'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Poland': 'PL', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Greece': 'GR', 'Portugal': 'PT', 'Sweden': 'SE', 'Finland': 'FI', 'Denmark': 'DK', 'Norway': 'NO', 'Turkey': 'TR', 'Brazil': 'BR', 'Mexico': 'MX', 'India': 'IN', 'Ireland': 'IE', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Russia': 'RU', 'China': 'CN', 'Japan': 'JP', 'Indonesia': 'ID', 'Nigeria': 'NG', 'South Africa': 'ZA' };
                    const compIso = isoLookup[compCountry] || isoCode;

                    const dupCheck = await checkDuplicate(comp.company_name, compDomain || '', compCountry);
                    if (dupCheck.isDuplicate) continue;

                    const groupId = generateDomainFingerprint(comp.company_name, compDomain || '');
                    const typeFlags = {
                      handles_waste_oil: ['re_refiner', 'waste_oil_recycler', 'used_oil_collector', 'waste_management_company', 'hazardous_waste_company'].includes(comp.company_type),
                      is_existing_rerefiner: comp.company_type === 're_refiner',
                      is_collector_only: comp.company_type === 'used_oil_collector',
                    };
                    const scoring = calculateOpportunityScore({
                      company_type: comp.company_type, handles_waste_oil: typeFlags.handles_waste_oil,
                      is_plant_opportunity: false, iso_code: compIso,
                      feedstock_access_estimate: comp.company_type === 're_refiner' ? 70 : 50,
                      capital_capability_estimate: comp.company_type === 're_refiner' ? 55 : 35,
                      strategic_fit_estimate: comp.company_type === 're_refiner' ? 65 : 45,
                      contactability_estimate: compDomain ? 50 : 15,
                    }, false, false);

                    try {
                      await db.execute(sql`
                        INSERT INTO radar_companies (canonical_name, country, iso_code, website, root_domain, user_id, status,
                          company_type, company_summary, classification_confidence, overall_confidence,
                          handles_waste_oil, is_existing_rerefiner, is_collector_only, is_likely_epc_target,
                          opportunity_score, score_band, duplicate_group_id, evidence_summary)
                        VALUES (${comp.company_name}, ${compCountry}, ${compIso}, ${comp.company_website || ''}, ${compDomain || ''},
                          ${userId}, 'classified', ${comp.company_type}, ${comp.brief_description || ''},
                          ${0.92}, ${0.92}, ${typeFlags.handles_waste_oil}, ${typeFlags.is_existing_rerefiner},
                          ${typeFlags.is_collector_only}, ${false}, ${scoring.final}, ${scoring.band},
                          ${groupId}, ${'Regulatory registry: ' + item.link})
                      `);
                      totalAdded++;
                      console.log(`[Radar] Registry mining added: ${comp.company_name} (${comp.company_type}) — ${compCountry}`);

                      if (compDomain && comp.company_website) {
                        try {
                          const homeCrawl = await crawlPage(comp.company_website);
                          if (homeCrawl.success) {
                            const detailedAi = await classifyCompanyWithAI(comp.company_name, comp.brief_description || '', comp.company_website, homeCrawl.visibleText.substring(0, 5000));
                            const detailedResult = enforceClassificationConsistency(detailedAi);
                            const detailedScoring = calculateOpportunityScore(detailedResult, false, false);
                            await db.execute(sql`
                              UPDATE radar_companies SET company_type = ${detailedResult.company_type || comp.company_type},
                                company_summary = ${detailedResult.company_summary || comp.brief_description || ''},
                                classification_confidence = ${Number(detailedResult.classification_confidence) || 0.92},
                                overall_confidence = ${Number(detailedResult.classification_confidence) || 0.92},
                                handles_waste_oil = ${detailedResult.handles_waste_oil || typeFlags.handles_waste_oil},
                                is_existing_rerefiner = ${detailedResult.is_existing_rerefiner || typeFlags.is_existing_rerefiner},
                                is_plant_opportunity = ${detailedResult.is_plant_opportunity || false},
                                is_likely_epc_target = ${detailedResult.is_likely_epc_target || false},
                                opportunity_score = ${detailedScoring.final}, score_band = ${detailedScoring.band},
                                likely_feedstock_access = ${Number(detailedResult.feedstock_access_estimate) || 0},
                                likely_capital_capability = ${Number(detailedResult.capital_capability_estimate) || 0},
                                likely_strategic_fit = ${Number(detailedResult.strategic_fit_estimate) || 0},
                                ai_reasoning_summary = ${detailedScoring.explanation}
                              WHERE canonical_name = ${comp.company_name} AND iso_code = ${compIso}
                            `);
                          }
                          await new Promise(resolve => setTimeout(resolve, 1500));
                        } catch (e) {
                          console.log(`[Radar] Could not deep-crawl registry company: ${comp.company_website}`);
                        }
                      }
                    } catch (insertErr: any) {
                      if (insertErr.code !== '23505') console.error(`[Radar] Registry mining insert error:`, insertErr.message);
                    }
                  }
                }
                count++;
              } else {
                await db.execute(sql`
                  INSERT INTO radar_search_results (search_job_id, title, url, snippet, domain, rank, content_fingerprint)
                  VALUES (${jobId}, ${item.title || ''}, ${item.link}, ${item.snippet || ''}, ${extractDomain(item.link)}, ${i + 1}, ${fingerprint})
                  RETURNING id
                `);
                count++;

                processDiscoveryResult(userId, jobId, 0,
                  item.title || '', item.snippet || '', item.link, country, isoCode
                ).catch(err => console.error('Registry mining process error:', err));
              }
            } catch (err: any) {
              if (err.code === '23505') continue;
            }
          }

          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'completed', results_count = ${count}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
        } catch (searchError: any) {
          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'failed', error_message = ${searchError.message || 'Search failed'}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[Radar] Registry mining query error:`, err);
      }
    }
  } catch (error) {
    console.error('[Radar] Regulatory registry mining error:', error);
  }

  console.log(`[Radar] Phase 4: Regulatory registry mining complete — ${totalAdded} companies added for ${country}`);
  return totalAdded;
}

async function runDiscoveryJob(userId: number, country: string, isoCode: string, language: string) {
  const queries = generateSearchQueries(country, isoCode, language);
  console.log(`Starting discovery for ${country} (${isoCode}) - ${queries.length} queries`);

  let totalResults = 0;

  const searchDepthByFamily: Record<string, number[]> = {
    company_discovery: [1, 11, 21],
    recycler_discovery: [1, 11, 21],
    base_oil_sellers: [1, 11, 21],
    directory_mining: [1, 11, 21],
    regulatory_registry: [1, 11, 21],
    regulatory_docs: [1, 11],
    trade_flow: [1, 11],
    tradeshow_discovery: [1, 11],
    project_signal: [1, 11],
  };

  for (const q of queries) {
    try {
      const pagesToSearch = searchDepthByFamily[q.family] || [1];

      for (const startIdx of pagesToSearch) {
        const pageNum = Math.floor((startIdx - 1) / 10) + 1;
        const pageLabel = startIdx === 1 ? '' : ` [page ${pageNum}]`;
        const jobResult = await db.execute(sql`
          INSERT INTO radar_search_jobs (country, iso_code, language, query, query_family, source_class, status, user_id, started_at)
          VALUES (${country}, ${isoCode}, ${q.language}, ${q.query + pageLabel}, ${q.family}, 'search_result', 'running', ${userId}, NOW())
          RETURNING id
        `);
        const jobId = Number(jobResult.rows[0].id);

        try {
          const searchData = await executeGoogleSearch(q.query, isoCode, startIdx);
          const items = searchData.items || [];

          let count = 0;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.link || item.link.toLowerCase().endsWith('.pdf')) continue;

            const fingerprint = crypto.createHash('sha256').update(`${item.title}|${item.link}`).digest('hex').substring(0, 64);

            try {
              const existing = await db.execute(sql`
                SELECT id FROM radar_search_results WHERE content_fingerprint = ${fingerprint} LIMIT 1
              `);
              if (existing.rows.length > 0) continue;

              const srResult = await db.execute(sql`
                INSERT INTO radar_search_results (search_job_id, title, url, snippet, domain, rank, content_fingerprint)
                VALUES (${jobId}, ${item.title || ''}, ${item.link}, ${item.snippet || ''}, ${extractDomain(item.link)}, ${startIdx + i}, ${fingerprint})
                RETURNING id
              `);
              count++;
              totalResults++;

              processDiscoveryResult(userId, jobId, Number(srResult.rows[0].id),
                item.title || '', item.snippet || '', item.link, country, isoCode
              ).catch(err => console.error('Background process error:', err));

            } catch (err: any) {
              if (err.code === '23505') continue;
              console.error('Store result error:', err);
            }
          }

          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'completed', results_count = ${count}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
        } catch (searchError: any) {
          await db.execute(sql`
            UPDATE radar_search_jobs SET status = 'failed', error_message = ${searchError.message || 'Search failed'}, completed_at = NOW()
            WHERE id = ${jobId}
          `);
          console.error(`Search failed for query "${q.query}${pageLabel}":`, searchError.message);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Job creation error for query "${q.query}":`, error);
    }
  }

  console.log(`[Radar] Phase 1.5: Injecting seed directory URLs for ${country}`);
  const seedResults = await injectSeedDirectories(userId, country, isoCode);
  totalResults += seedResults;

  console.log(`[Radar] Phase 2: AI-driven adaptive follow-up for ${country}`);
  const adaptiveResults = await runAdaptiveFollowUp(userId, country, isoCode, language);
  totalResults += adaptiveResults;

  console.log(`[Radar] Phase 3: Crawling AI-discovered directories for ${country}`);
  const dirResults = await crawlDiscoveredDirectories(userId, country, isoCode);
  totalResults += dirResults;

  console.log(`[Radar] Phase 4: Regulatory registry mining for ${country}`);
  const registryResults = await runRegulatoryRegistryMining(userId, country, isoCode, language);
  totalResults += registryResults;

  if (totalResults > 0) {
    await createAlert('new_company_priority_country', 'info',
      `Discovery complete: ${country}`,
      `Found ${totalResults} new results for ${country} (including ${registryResults} from regulatory registries)`,
      undefined, undefined, country);
  }

  console.log(`Discovery for ${country} complete: ${totalResults} total results from ${queries.length} queries (${registryResults} from regulatory registries)`);
}

// ========== API ROUTES ==========

router.post('/discovery/seed-directories', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { country, isoCode } = req.body;
    if (!country || !isoCode) {
      return res.status(400).json({ success: false, error: 'Country and ISO code required' });
    }

    const results = await injectSeedDirectories(userId, country, isoCode);
    res.json({ success: true, message: `Seed directory crawl complete: ${results} companies added`, added: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/discovery/start', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { country, isoCode } = req.body;
    if (!country || !isoCode) {
      return res.status(400).json({ success: false, error: 'Country and ISO code required' });
    }

    const language = COUNTRY_LANGUAGE_MAP[isoCode] || 'en';

    runDiscoveryJob(userId, country, isoCode, language).catch(err => {
      console.error('Discovery job error:', err);
    });

    res.json({ success: true, message: `Discovery started for ${country}`, language });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const companies = await db.execute(sql`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE company_type != 'not_relevant' AND company_type != 'unclear') as relevant,
        COUNT(*) FILTER (WHERE score_band = 'hot') as hot,
        COUNT(*) FILTER (WHERE score_band = 'strong') as strong,
        COUNT(*) FILTER (WHERE score_band = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE score_band = 'watchlist') as watchlist,
        COUNT(*) FILTER (WHERE promoted_to_crm = TRUE) as promoted
      FROM radar_companies
    `);

    const projects = await db.execute(sql`SELECT COUNT(*) as total FROM radar_projects`);
    const contacts = await db.execute(sql`SELECT COUNT(*) as total FROM radar_contacts`);
    const alerts = await db.execute(sql`SELECT COUNT(*) as total FROM radar_alerts WHERE status = 'new'`);

    const topCountries = await db.execute(sql`
      SELECT country, iso_code, relevant_company_count, project_count, hot_opportunity_count, opportunity_score, priority
      FROM radar_country_intelligence
      WHERE relevant_company_count > 0
      ORDER BY opportunity_score DESC
      LIMIT 10
    `);

    const recentAlerts = await db.execute(sql`
      SELECT ra.*, rc.canonical_name as company_name
      FROM radar_alerts ra
      LEFT JOIN radar_companies rc ON ra.company_id = rc.id
      WHERE ra.status = 'new'
      ORDER BY ra.created_at DESC
      LIMIT 10
    `);

    const scoreBands = await db.execute(sql`
      SELECT score_band, COUNT(*) as count FROM radar_companies
      WHERE company_type != 'not_relevant' AND company_type != 'unclear'
      GROUP BY score_band
    `);

    const companyTypes = await db.execute(sql`
      SELECT company_type, COUNT(*) as count FROM radar_companies
      WHERE company_type != 'not_relevant' AND company_type != 'unclear'
      GROUP BY company_type ORDER BY count DESC
    `);

    res.json({
      success: true,
      stats: {
        totalCompanies: Number(companies.rows[0]?.total) || 0,
        relevantCompanies: Number(companies.rows[0]?.relevant) || 0,
        hotOpportunities: Number(companies.rows[0]?.hot) || 0,
        strongOpportunities: Number(companies.rows[0]?.strong) || 0,
        qualifiedOpportunities: Number(companies.rows[0]?.qualified) || 0,
        watchlistCompanies: Number(companies.rows[0]?.watchlist) || 0,
        promotedToCRM: Number(companies.rows[0]?.promoted) || 0,
        totalProjects: Number(projects.rows[0]?.total) || 0,
        totalContacts: Number(contacts.rows[0]?.total) || 0,
        pendingAlerts: Number(alerts.rows[0]?.total) || 0,
      },
      topCountries: topCountries.rows,
      recentAlerts: recentAlerts.rows,
      scoreBands: scoreBands.rows,
      companyTypes: companyTypes.rows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/companies', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { country, companyType, scoreBand, minScore, search } = req.query;

    let query = `
      SELECT rc.*, 
        (SELECT COUNT(*) FROM radar_contacts WHERE company_id = rc.id) as contact_count,
        (SELECT COUNT(*) FROM radar_projects WHERE company_id = rc.id) as project_count,
        (SELECT COUNT(*) FROM radar_company_pages WHERE company_id = rc.id AND crawl_status = 'completed') as pages_crawled
      FROM radar_companies rc
      WHERE 1=1
    `;
    const conditions: string[] = [];

    if (country) conditions.push(`rc.iso_code = '${(country as string).replace(/'/g, "''")}'`);
    if (companyType) conditions.push(`rc.company_type = '${(companyType as string).replace(/'/g, "''")}'`);
    if (scoreBand) conditions.push(`rc.score_band = '${(scoreBand as string).replace(/'/g, "''")}'`);
    if (minScore) conditions.push(`rc.opportunity_score >= ${parseFloat(minScore as string) || 0}`);
    if (search) conditions.push(`(rc.canonical_name ILIKE '%${(search as string).replace(/'/g, "''")}%' OR rc.root_domain ILIKE '%${(search as string).replace(/'/g, "''")}%')`);

    conditions.push(`rc.company_type NOT IN ('not_relevant', 'unclear')`);
    conditions.push(`rc.overall_confidence >= 0.7`);
    if (!minScore) conditions.push(`rc.opportunity_score >= 35`);

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY rc.opportunity_score DESC, rc.created_at DESC LIMIT 200`;

    const result = await db.execute(sql.raw(query));

    res.json({
      success: true,
      companies: result.rows.map(row => ({
        ...row,
        id: Number(row.id),
        opportunity_score: Number(row.opportunity_score),
        overall_confidence: Number(row.overall_confidence),
        classification_confidence: Number(row.classification_confidence),
        contact_count: Number(row.contact_count),
        project_count: Number(row.project_count),
        pages_crawled: Number(row.pages_crawled),
      })),
      count: result.rows.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/companies/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const companyId = parseInt(req.params.id);

    const company = await db.execute(sql`SELECT * FROM radar_companies WHERE id = ${companyId}`);
    if (company.rows.length === 0) return res.status(404).json({ success: false, error: 'Company not found' });

    const pages = await db.execute(sql`SELECT * FROM radar_company_pages WHERE company_id = ${companyId} ORDER BY crawled_at DESC`);
    const contacts = await db.execute(sql`SELECT * FROM radar_contacts WHERE company_id = ${companyId}`);
    const projects = await db.execute(sql`SELECT * FROM radar_projects WHERE company_id = ${companyId}`);
    const scores = await db.execute(sql`SELECT * FROM radar_scores WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 1`);
    const sources = await db.execute(sql`SELECT * FROM radar_sources WHERE domain = ${company.rows[0].root_domain} ORDER BY discovered_at DESC`);
    const relationships = await db.execute(sql`
      SELECT * FROM radar_relationships
      WHERE (from_entity_type = 'company' AND from_entity_id = ${companyId})
         OR (to_entity_type = 'company' AND to_entity_id = ${companyId})
    `);

    res.json({
      success: true,
      company: { ...company.rows[0], id: companyId, opportunity_score: Number(company.rows[0].opportunity_score) },
      pages: pages.rows,
      contacts: contacts.rows,
      projects: projects.rows,
      score: scores.rows[0] || null,
      sources: sources.rows,
      relationships: relationships.rows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projects', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { country, projectType, minConfidence } = req.query;

    let conditions = '';
    if (country) conditions += ` AND rp.iso_code = '${(country as string).replace(/'/g, "''")}'`;
    if (projectType) conditions += ` AND rp.project_type = '${(projectType as string).replace(/'/g, "''")}'`;
    if (minConfidence) conditions += ` AND rp.project_confidence >= ${parseFloat(minConfidence as string) || 0}`;

    const result = await db.execute(sql.raw(`
      SELECT rp.*, rc.canonical_name as company_name, rc.root_domain, rc.opportunity_score as company_score
      FROM radar_projects rp
      LEFT JOIN radar_companies rc ON rp.company_id = rc.id
      WHERE 1=1 ${conditions}
      ORDER BY rp.project_confidence DESC, rp.discovered_at DESC
      LIMIT 200
    `));

    res.json({ success: true, projects: result.rows, count: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT rc.*, rco.canonical_name as company_name, rco.root_domain, rco.company_type,
        rco.opportunity_score as company_score, rco.overall_confidence, rco.country
      FROM radar_contacts rc
      LEFT JOIN radar_companies rco ON rc.company_id = rco.id
      WHERE rco.overall_confidence >= 0.7 
        AND rco.company_type NOT IN ('not_relevant', 'unclear')
        AND rco.opportunity_score >= 35
      ORDER BY rco.opportunity_score DESC, rc.confidence DESC, rc.created_at DESC
      LIMIT 300
    `);

    res.json({ success: true, contacts: result.rows, count: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/countries', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT * FROM radar_country_intelligence ORDER BY
        CASE priority WHEN 'priority' THEN 1 WHEN 'active' THEN 2 WHEN 'watchlist' THEN 3 WHEN 'paused' THEN 4 END,
        opportunity_score DESC
    `);

    res.json({ success: true, countries: result.rows, count: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/countries/:isoCode/priority', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { isoCode } = req.params;
    const { priority } = req.body;

    if (!['priority', 'active', 'watchlist', 'paused'].includes(priority)) {
      return res.status(400).json({ success: false, error: 'Invalid priority' });
    }

    await db.execute(sql`
      UPDATE radar_country_intelligence SET priority = ${priority}, updated_at = NOW()
      WHERE iso_code = ${isoCode}
    `);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { priority, status: alertStatus } = req.query;

    let conditions = '';
    if (priority) conditions += ` AND ra.priority = '${(priority as string).replace(/'/g, "''")}'`;
    if (alertStatus) conditions += ` AND ra.status = '${(alertStatus as string).replace(/'/g, "''")}'`;

    const result = await db.execute(sql.raw(`
      SELECT ra.*, rc.canonical_name as company_name
      FROM radar_alerts ra
      LEFT JOIN radar_companies rc ON ra.company_id = rc.id
      WHERE 1=1 ${conditions}
      ORDER BY
        CASE ra.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'watch' THEN 3 WHEN 'info' THEN 4 END,
        ra.created_at DESC
      LIMIT 200
    `));

    res.json({ success: true, alerts: result.rows, count: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/alerts/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    await db.execute(sql`UPDATE radar_alerts SET status = 'dismissed' WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/discovery/jobs', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT * FROM radar_search_jobs
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({ success: true, jobs: result.rows, count: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/discovery/status/:country', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { country } = req.params;

    const jobs = await db.execute(sql`
      SELECT status, COUNT(*) as cnt FROM radar_search_jobs
      WHERE country = ${country}
      GROUP BY status
    `);

    const total = await db.execute(sql`
      SELECT COUNT(*) as total FROM radar_search_jobs WHERE country = ${country}
    `);

    const completed = jobs.rows.find((r: any) => r.status === 'completed');
    const running = jobs.rows.find((r: any) => r.status === 'running');
    const failed = jobs.rows.find((r: any) => r.status === 'failed');

    res.json({
      success: true,
      country,
      totalJobs: Number(total.rows[0]?.total) || 0,
      completedJobs: Number(completed?.cnt) || 0,
      runningJobs: Number(running?.cnt) || 0,
      failedJobs: Number(failed?.cnt) || 0,
      isRunning: (Number(running?.cnt) || 0) > 0,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/companies/:id/type', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const companyId = parseInt(req.params.id);
    const { company_type } = req.body;

    const validTypes = [
      'used_oil_collector', 'waste_oil_recycler', 're_refiner', 'waste_management_company',
      'lubricant_company', 'base_oil_company', 'industrial_recycler', 'hazardous_waste_company',
      'trader_only', 'competitor', 'not_relevant', 'unclear'
    ];
    if (!company_type || !validTypes.includes(company_type)) {
      return res.status(400).json({ success: false, error: 'Invalid company type' });
    }

    const company = await db.execute(sql`SELECT * FROM radar_companies WHERE id = ${companyId}`);
    if (!company.rows.length) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const typeFlags = {
      handles_waste_oil: ['re_refiner', 'waste_oil_recycler', 'used_oil_collector', 'waste_management_company', 'hazardous_waste_company'].includes(company_type),
      is_existing_rerefiner: company_type === 're_refiner',
      is_collector_only: company_type === 'used_oil_collector',
    };

    const comp = company.rows[0] as any;
    const scoringData = {
      company_type,
      handles_waste_oil: typeFlags.handles_waste_oil,
      is_plant_opportunity: comp.is_plant_opportunity || false,
      iso_code: comp.iso_code || '',
      feedstock_access_estimate: Number(comp.likely_feedstock_access) || (company_type === 're_refiner' ? 60 : 40),
      capital_capability_estimate: Number(comp.likely_capital_capability) || (company_type === 're_refiner' ? 50 : 30),
      strategic_fit_estimate: Number(comp.likely_strategic_fit) || (company_type === 're_refiner' ? 60 : 40),
      contactability_estimate: comp.root_domain ? 40 : 10,
    };
    const scoring = calculateOpportunityScore(scoringData, false, false);

    await db.execute(sql`
      UPDATE radar_companies SET
        company_type = ${company_type},
        handles_waste_oil = ${typeFlags.handles_waste_oil},
        is_existing_rerefiner = ${typeFlags.is_existing_rerefiner},
        is_collector_only = ${typeFlags.is_collector_only},
        opportunity_score = ${scoring.final},
        score_band = ${scoring.band},
        ai_reasoning_summary = ${scoring.explanation},
        updated_at = NOW()
      WHERE id = ${companyId}
    `);

    console.log(`[Radar] Company ${companyId} type manually changed to ${company_type} by user ${userId}`);
    res.json({ success: true, company_type, opportunity_score: scoring.final, score_band: scoring.band });
  } catch (error: any) {
    console.error('[Radar] Update company type error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/companies/:id/promote', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const companyId = parseInt(req.params.id);

    const company = await db.execute(sql`SELECT * FROM radar_companies WHERE id = ${companyId}`);
    if (company.rows.length === 0) return res.status(404).json({ success: false, error: 'Company not found' });

    const comp = company.rows[0];
    if (comp.promoted_to_crm) {
      return res.status(400).json({ success: false, error: 'Already promoted to CRM' });
    }

    const contacts = await db.execute(sql`SELECT * FROM radar_contacts WHERE company_id = ${companyId} LIMIT 5`);
    const primaryContact = contacts.rows[0] || {};

    try {
      const outreachPrompt = `Generate a brief CRM promotion summary for this waste oil recycling company:
Company: ${comp.canonical_name}
Type: ${comp.company_type}
Country: ${comp.country}
Summary: ${comp.company_summary}
Score: ${comp.opportunity_score}/100 (${comp.score_band})
Evidence: ${comp.evidence_summary}

Respond with JSON: {"why_relevant": "...", "outreach_angle": "...", "suggested_contact_type": "...", "draft_outreach_note": "..."}`;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Generate CRM promotion notes. Respond with JSON only." },
          { role: "user", content: outreachPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      const outreach = JSON.parse(aiResponse.choices[0].message.content || '{}');

      const leadResult = await db.execute(sql`
        INSERT INTO leads (company_name, contact_name, contact_email, contact_phone, website, country, industry, notes, requirements)
        VALUES (${comp.canonical_name}, ${primaryContact.name || null}, ${primaryContact.email || null},
          ${primaryContact.phone || null}, ${comp.website}, ${comp.country}, ${'Oil & Gas / Recycling'},
          ${outreach.why_relevant || comp.company_summary}, ${outreach.outreach_angle || ''})
        RETURNING id
      `);

      await db.execute(sql`
        UPDATE radar_companies SET promoted_to_crm = TRUE, promoted_lead_id = ${Number(leadResult.rows[0]?.id)}, updated_at = NOW()
        WHERE id = ${companyId}
      `);

      res.json({
        success: true,
        leadId: Number(leadResult.rows[0]?.id),
        outreach,
      });
    } catch (promoteError: any) {
      res.status(500).json({ success: false, error: 'Promotion failed: ' + promoteError.message });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/companies', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT rc.*,
        (SELECT COUNT(*) FROM radar_contacts WHERE company_id = rc.id) as contact_count,
        (SELECT COUNT(*) FROM radar_projects WHERE company_id = rc.id) as project_count
      FROM radar_companies rc
      WHERE rc.company_type != 'not_relevant'
      ORDER BY rc.opportunity_score DESC
    `);

    const headers = ['Company Name','Type','Country','Website','Score','Band','Confidence','Summary','Evidence','Waste Oil','Plant Opportunity','EPC Target','Contacts','Projects','Status'];
    const rows = [headers.join(',')];

    for (const row of result.rows) {
      const values = [
        `"${(row.canonical_name || '').toString().replace(/"/g, '""')}"`,
        row.company_type,
        row.country,
        row.website,
        row.opportunity_score,
        row.score_band,
        row.overall_confidence,
        `"${(row.company_summary || '').toString().replace(/"/g, '""').substring(0, 200)}"`,
        `"${(row.evidence_summary || '').toString().replace(/"/g, '""').substring(0, 200)}"`,
        row.handles_waste_oil ? 'Yes' : 'No',
        row.is_plant_opportunity ? 'Yes' : 'No',
        row.is_likely_epc_target ? 'Yes' : 'No',
        row.contact_count,
        row.project_count,
        row.status,
      ];
      rows.push(values.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="radar_companies_export.csv"');
    res.send(rows.join('\n'));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/projects', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT rp.*, rc.canonical_name as company_name
      FROM radar_projects rp
      LEFT JOIN radar_companies rc ON rp.company_id = rc.id
      ORDER BY rp.project_confidence DESC
    `);

    const headers = ['Project Name','Type','Company','Country','Summary','Evidence','Urgency','Confidence','Score','Status'];
    const rows = [headers.join(',')];
    for (const row of result.rows) {
      rows.push([
        `"${(row.project_name || '').toString().replace(/"/g, '""')}"`,
        row.project_type, `"${(row.company_name || '').toString().replace(/"/g, '""')}"`,
        row.country, `"${(row.project_summary || '').toString().replace(/"/g, '""').substring(0, 200)}"`,
        `"${(row.evidence_text || '').toString().replace(/"/g, '""').substring(0, 200)}"`,
        row.urgency, row.project_confidence, row.opportunity_score, row.status
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="radar_projects_export.csv"');
    res.send(rows.join('\n'));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/contacts', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT rc.*, rco.canonical_name as company_name, rco.country
      FROM radar_contacts rc
      LEFT JOIN radar_companies rco ON rc.company_id = rco.id
      WHERE rco.overall_confidence >= 0.7 AND rco.company_type != 'not_relevant' AND rco.company_type != 'unclear'
      ORDER BY rc.confidence DESC
    `);

    const headers = ['Name','Title','Email','Phone','Type','Company','Country','Confidence','Source URL'];
    const rows = [headers.join(',')];
    for (const row of result.rows) {
      rows.push([
        `"${(row.name || '').toString().replace(/"/g, '""')}"`, `"${(row.title || '').toString().replace(/"/g, '""')}"`,
        row.email, row.phone, row.contact_type, `"${(row.company_name || '').toString().replace(/"/g, '""')}"`,
        row.country, row.confidence, row.source_url
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="radar_contacts_export.csv"');
    res.send(rows.join('\n'));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/clean-all', async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM radar_alerts`);
    await db.execute(sql`DELETE FROM radar_scores`);
    await db.execute(sql`DELETE FROM radar_relationships`);
    await db.execute(sql`DELETE FROM radar_projects`);
    await db.execute(sql`DELETE FROM radar_contacts`);
    await db.execute(sql`DELETE FROM radar_company_pages`);
    await db.execute(sql`DELETE FROM radar_companies`);
    await db.execute(sql`DELETE FROM radar_sources`);
    await db.execute(sql`DELETE FROM radar_search_results`);
    await db.execute(sql`DELETE FROM radar_search_jobs`);
    console.log('[Radar] All data cleaned successfully');
    res.json({ success: true, message: 'All radar data has been cleaned.' });
  } catch (error: any) {
    console.error('Clean all error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
