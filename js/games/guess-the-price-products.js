const IMAGE_ROOT = "./assets/images/guess%20the%20price";

export const PRICE_PRODUCTS = [
  {
    id: "heated-gloves",
    name: "Beheizbare Handschuhe",
    src: `${IMAGE_ROOT}/01-beheizbare-handschuhe.webp`
  },
  {
    id: "bmw-m2",
    name: "BMW M2",
    src: `${IMAGE_ROOT}/02-bmw-m2.webp`
  },
  {
    id: "phone-tripod",
    name: "Handystativ",
    src: `${IMAGE_ROOT}/03-handystativ.webp`
  },
  {
    id: "thriller-vinyl",
    name: "Michael Jackson – Thriller Vinyl",
    src: `${IMAGE_ROOT}/04-thriller-vinyl.webp`
  },
  {
    id: "oxford-master",
    name: "Master in Mathematical Sciences · Oxford (1 Jahr, Overseas)",
    src: `${IMAGE_ROOT}/05-oxford-master.webp`
  },
  {
    id: "oono",
    name: "OOONO",
    src: `${IMAGE_ROOT}/06-oono.webp`
  },
  {
    id: "zwilling-knife-block",
    name: "Zwilling Messerblock",
    src: `${IMAGE_ROOT}/07-zwilling-messerblock.webp`
  }
];

export function getPriceProduct(index) {
  return PRICE_PRODUCTS[index] || PRICE_PRODUCTS[0];
}
