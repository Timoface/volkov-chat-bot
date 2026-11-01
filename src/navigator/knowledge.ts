// База знаний прототипа «Навигатор компании».
// Все имена, кабинеты и телефоны — демонстрационные; в рабочей версии их отдаёт кадровая система.

export type Role = 'worker' | 'office' | 'manager';

export const ROLES: Record<Role, {label: string; hint: string}> = {
  worker: {label: 'Производство', hint: 'Оператор линии, Кемерово'},
  office: {label: 'Офис', hint: 'Специалист, управление'},
  manager: {label: 'Руководитель', hint: 'Начальник цеха'},
};

export type ServiceId = 'hr' | 'legal' | 'it' | 'office' | 'access' | 'safety' | 'accounting';

export interface Contact {
  service: string;
  person: string;
  position: string;
  room: string;
  phone: string;
  hours: string;
}

export const CONTACTS: Record<ServiceId, Contact> = {
  hr: {service: 'Отдел кадров', person: 'Ирина Соколова', position: 'Специалист по кадрам', room: 'АБК, 2 этаж, каб. 214', phone: 'вн. 1214', hours: 'пн–пт 8:00–17:00'},
  legal: {service: 'Юридический отдел', person: 'Артём Белов', position: 'Юрисконсульт', room: 'АБК, 3 этаж, каб. 305', phone: 'вн. 1305', hours: 'пн–пт 9:00–18:00'},
  it: {service: 'Техподдержка', person: 'Дежурный инженер', position: 'Служба ИТ', room: 'АБК, 1 этаж, каб. 108', phone: 'вн. 1100', hours: 'круглосуточно'},
  office: {service: 'Административно-хозяйственный отдел', person: 'Ольга Миронова', position: 'Администратор', room: 'АБК, 1 этаж, каб. 101', phone: 'вн. 1101', hours: 'пн–пт 8:00–17:00'},
  access: {service: 'Служба безопасности', person: 'Сергей Ковалёв', position: 'Инспектор по допуску', room: 'Проходная №1', phone: 'вн. 1001', hours: 'круглосуточно'},
  safety: {service: 'Охрана труда', person: 'Денис Фролов', position: 'Инженер по охране труда', room: 'Производственный корпус, каб. 12', phone: 'вн. 1512', hours: 'пн–пт 7:30–16:30'},
  accounting: {service: 'Бухгалтерия', person: 'Наталья Ермакова', position: 'Расчётный бухгалтер', room: 'АБК, 2 этаж, каб. 220', phone: 'вн. 1220', hours: 'пн–пт 9:00–17:00'},
};

export interface Article {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  service: ServiceId;
  roles: Role[];
  updated: string; // ISO-дата последней проверки владельцем
  validUntil?: string; // после этой даты статья скрывается как устаревшая
}

const ALL: Role[] = ['worker', 'office', 'manager'];

export const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatToday = () =>
  new Date().toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});

export const formatDate = (iso?: string | Date) => {
  if (!iso) return formatToday();
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return formatToday();
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
};

export const ARTICLES: Article[] = [
  {
    id: 'vacation',
    title: 'Отпуск: как оформить',
    keywords: ['отпуск', 'отгул', 'отдых', 'график отпусков', 'заявление на отпуск'],
    answer:
      'Ежегодный отпуск идёт по **графику отпусков** на 2026 год.\n\n1. За 2 недели до начала напишите заявление — бланк у мастера смены или на портале.\n2. Согласуйте с непосредственным руководителем.\n3. Передайте в отдел кадров — уведомление придёт за 14 дней.\n\nПеренос отпуска — только по согласованию с руководителем.',
    service: 'hr',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'vacation-2025',
    title: 'Отпуск: график 2025 года',
    keywords: ['отпуск', 'график отпусков'],
    answer: 'График отпусков на 2025 год.',
    service: 'hr',
    roles: ALL,
    updated: '2024-12-10',
    validUntil: '2025-12-31',
  },
  {
    id: 'certificate',
    title: 'Справка с места работы, 2-НДФЛ',
    keywords: ['справка', 'ндфл', '2-ндфл', 'справку', 'доход', 'место работы', 'копия трудовой'],
    answer:
      'Справку с места работы делает **отдел кадров** за 1 рабочий день, справку о доходах (2-НДФЛ) — **бухгалтерия** за 3 рабочих дня.\n\nЗаявку можно оставить у мастера смены — справку передадут в цех.',
    service: 'hr',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'salary',
    title: 'Расчётный листок и зарплата',
    keywords: ['зарплата', 'расчётный', 'расчетный', 'аванс', 'выплата', 'премия', 'листок', 'деньги'],
    answer:
      'Зарплата выплачивается **дважды в месяц**: аванс 25-го и расчёт 10-го числа.\n\nРасчётный листок приходит на корпоративную почту, у сотрудников производства — в терминале у проходной. Если сумма не сходится — в бухгалтерию.',
    service: 'accounting',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'password',
    title: 'Пароль, почта, 1С — не работает',
    keywords: ['пароль', 'почта', 'компьютер', 'принтер', '1с', 'не работает', 'вход', 'учётная', 'учетная', 'сломался', 'интернет', 'ит', 'техподдержка'],
    answer:
      'Сбросить пароль можно самостоятельно на портале **«Мой профиль»** по номеру телефона.\n\nЕсли не получилось — позвоните дежурному инженеру: **вн. 1100**, служба работает круглосуточно. Назовите табельный номер и номер компьютера (наклейка на корпусе).',
    service: 'it',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'pass',
    title: 'Пропуск: потерял или нужен гостевой',
    keywords: ['пропуск', 'проход', 'проходная', 'гость', 'гостевой', 'потерял', 'турникет', 'допуск'],
    answer:
      'Потерянный пропуск блокирует **служба безопасности** на проходной №1 — сообщите сразу, временный выдадут на смену.\n\nГостевой пропуск заказывает принимающий сотрудник не позже чем за день: ФИО гостя, время и цель визита.',
    service: 'access',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'medical',
    title: 'Медосмотр и санитарная книжка',
    keywords: ['медосмотр', 'медкомиссия', 'санкнижка', 'санитарная', 'книжка', 'врач', 'медицинский'],
    answer:
      'Для работы с пищевой продукцией нужна действующая **санитарная книжка** и ежегодный медосмотр.\n\nНаправление выдаёт отдел охраны труда, медосмотр проходит в заводском здравпункте. Напоминание приходит за месяц до срока.',
    service: 'safety',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'uniform',
    title: 'Спецодежда и СИЗ',
    keywords: ['спецодежда', 'форма', 'халат', 'перчатки', 'сиз', 'обувь', 'одежда'],
    answer:
      'Спецодежду меняют раз в полгода или по износу. Заявку подаёт мастер смены, выдача — на складе СИЗ, производственный корпус, вход Б.',
    service: 'safety',
    roles: ['worker', 'manager'],
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'contract',
    title: 'Проверка договора с поставщиком',
    keywords: ['договор', 'контракт', 'поставщик', 'юрист', 'согласование', 'претензия', 'юридический'],
    answer:
      'Договор отправляется на согласование через СЭД: карточка «Договор» → вложить проект → маршрут «Юридический отдел».\n\nСрок проверки — **3 рабочих дня**, для типовых договоров с локальными фермерами — 1 день.',
    service: 'legal',
    roles: ['office', 'manager'],
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'legal-personal',
    title: 'Личная юридическая консультация',
    keywords: ['консультация', 'юрист', 'право', 'закон', 'суд', 'кредит', 'алименты', 'юридический'],
    answer:
      'Юрисконсульт бесплатно консультирует сотрудников по трудовым вопросам **по четвергам с 14:00 до 16:00**. Запишитесь по внутреннему телефону — приём около 20 минут.',
    service: 'legal',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'rooms',
    title: 'Где кабинет / переговорная',
    keywords: ['кабинет', 'где', 'переговорная', 'найти', 'этаж', 'столовая', 'комната', 'забронировать'],
    answer:
      'Карта АБК: 1 этаж — АХО, ИТ, здравпункт; 2 этаж — кадры, бухгалтерия; 3 этаж — юристы и дирекция. Столовая — переход из АБК в производственный корпус.\n\nПереговорную бронирует АХО по телефону или в календаре Outlook.',
    service: 'office',
    roles: ALL,
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'overtime',
    title: 'Сверхурочные и табель смены',
    keywords: ['сверхурочные', 'табель', 'переработка', 'смена', 'график', 'выход', 'выходной'],
    answer:
      'Сверхурочные оформляются **приказом до начала работ** с письменного согласия сотрудника. Табель смены руководитель закрывает до 2-го числа следующего месяца в 1С:ЗУП.',
    service: 'hr',
    roles: ['manager'],
    get updated() {
      return getTodayIso();
    },
  },
  {
    id: 'hiring',
    title: 'Заявка на подбор сотрудника',
    keywords: ['подбор', 'вакансия', 'нанять', 'найм', 'новый сотрудник', 'кандидат', 'штатное'],
    answer:
      'Заявку на подбор руководитель создаёт в СЭД: «Кадры» → «Заявка на подбор». Нужны должность по штатному расписанию, график и требования. Первые кандидаты — в течение 5 рабочих дней.',
    service: 'hr',
    roles: ['manager'],
    get updated() {
      return getTodayIso();
    },
  },
];

export const SUGGESTIONS = [
  'Как оформить отпуск?',
  'Нужна справка 2-НДФЛ',
  'Забыл пароль от почты',
  'Где кабинет юриста?',
  'Потерял пропуск',
  'Как оформить сверхурочные?',
];

export const isCurrent = (a: Article) => !a.validUntil || new Date(a.validUntil) >= new Date();

// грубая основа слова: русские окончания не мешают совпадению «отпуск/отпуска/отпуске»
const stem = (w: string) => w.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(4, Math.min(6, w.length - 1)));
const words = (s: string) => s.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9-]+/g) ?? [];

export type Reply =
  | {kind: 'answer'; article: Article; contact: Contact; hiddenOutdated: number}
  | {kind: 'restricted'; article: Article; contact: Contact}
  | {kind: 'route'; contact: Contact}
  | {kind: 'unknown'};

const ROUTE_HINTS: Array<[ServiceId, string[]]> = [
  ['hr', ['кадр', 'отдел кадров', 'увольн', 'уволи', 'трудов', 'перевод', 'больничн']],
  ['legal', ['юрист', 'юрид']],
  ['it', ['компьют', 'ноутбук', 'монитор', 'сеть', 'wifi']],
  ['office', ['мебел', 'уборк', 'канцеляр', 'ключ']],
  ['access', ['охран', 'безопасн']],
  ['accounting', ['бухгалт', 'налог', 'вычет']],
  ['safety', ['травм', 'охрана труда', 'инструктаж']],
];

export function ask(question: string, role: Role): Reply {
  const qStems = words(question).map(stem);
  // сравниваем целые слова: иначе короткий ключ «ит» находится внутри «оформить»
  const q = ` ${words(question).join(' ')} `;
  const scored = ARTICLES.map((a) => {
    let score = 0;
    for (const k of a.keywords) {
      if (q.includes(` ${words(k).join(' ')} `)) score += 3;
      else if (words(k).every((w) => qStems.includes(stem(w)))) score += 2;
    }
    for (const w of words(a.title)) if (w.length > 3 && qStems.includes(stem(w))) score += 1;
    return {a, score};
  })
    // одно совпадение со словом из заголовка («оформить») — ещё не ответ
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score);

  const current = scored.filter((x) => isCurrent(x.a));
  const hiddenOutdated = scored.length - current.length;
  const allowed = current.find((x) => x.a.roles.includes(role));
  const best = current[0];

  if (allowed && (!best || allowed.score >= best.score - 1)) {
    return {kind: 'answer', article: allowed.a, contact: CONTACTS[allowed.a.service], hiddenOutdated};
  }
  if (best) return {kind: 'restricted', article: best.a, contact: CONTACTS[best.a.service]};

  const hint = ROUTE_HINTS.find(([, keys]) => keys.some((k) => q.includes(` ${k}`)));
  if (hint) return {kind: 'route', contact: CONTACTS[hint[0]]};
  return {kind: 'unknown'};
}
