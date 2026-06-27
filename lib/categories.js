// Hungarian translations of business categories, used in outreach copy
// so prospects never see English category names.
const CATEGORY_HU = {
  'restaurant': 'étterem',
  'dentist': 'fogászat',
  'hair salon': 'fodrászat',
  'auto repair': 'autószerviz',
  'plumber': 'vízvezeték-szerelő',
  'electrician': 'villanyszerelő',
  'bakery': 'pékség',
  'gym': 'edzőterem',
  'yoga studio': 'jógastúdió',
  'law firm': 'ügyvédi iroda',
  'accountant': 'könyvelő',
  'real estate agency': 'ingatlaniroda',
  'veterinary clinic': 'állatorvosi rendelő',
  'photographer': 'fotós',
  'florist': 'virágbolt',
  'tailor': 'szabó',
  'cleaning service': 'takarítószolgálat',
  'moving company': 'költöztető cég',
  'car wash': 'autómosó',
  'beauty salon': 'szépségszalon',
  'spa': 'spa',
  'tattoo studio': 'tetováló stúdió',
  'pet shop': 'állatkereskedés',
  'pharmacy': 'gyógyszertár',
  'optician': 'optika'
};

export function categoryHu(category) {
  return CATEGORY_HU[category] || category;
}
