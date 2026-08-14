const IMAGE_ROOT = "./assets/images/guess%20the%20price";

export const PRICE_PRODUCTS = [
  {
    id: "ck-one",
    name: "Calvin Klein CK One",
    src: `${IMAGE_ROOT}/Calcin%20Klein%20ck%20one%20(29,99%E2%82%AC).webp`
  },
  {
    id: "ferrero-box",
    name: "Ferrero Geschenkbox",
    src: `${IMAGE_ROOT}/Ferrero%20Box%20(59,99%E2%82%AC).webp`
  },
  {
    id: "der-nachbar",
    name: "Sebastian Fitzek – Der Nachbar",
    src: `${IMAGE_ROOT}/Fitzek%20der%20Nachbar%20(25,00%E2%82%AC).webp`
  },
  {
    id: "hyperx-cloud-3",
    name: "HyperX Cloud III",
    src: `${IMAGE_ROOT}/Hyperx%20Cloud%203%20(94,36%E2%82%AC).webp`
  },
  {
    id: "cat-toy",
    name: "Katzenspielzeug",
    src: `${IMAGE_ROOT}/Katzenspielzeug%20(22,94%E2%82%AC).webp`
  },
  {
    id: "mercedes",
    name: "Mercedes-AMG G 63 Kinderauto",
    src: `${IMAGE_ROOT}/Mercedes%20(144,48%E2%82%AC%20).webp`
  },
  {
    id: "weber-grill",
    name: "Weber Grill",
    src: `${IMAGE_ROOT}/Weber%20Grill%20(548,00%E2%82%AC).webp`
  },
  {
    id: "iphone-17-pro-max",
    name: "iPhone 17 Pro Max 2 TB",
    src: `${IMAGE_ROOT}/iPhone%2017%20pro%20max%202TB%20(2.269,00%E2%82%AC).webp`
  },
  {
    id: "rtx-5090",
    name: "NVIDIA GeForce RTX 5090",
    src: `${IMAGE_ROOT}/RTX%205090%20(4.746,04%E2%82%AC).webp`
  }
];

export function getPriceProduct(index) {
  return PRICE_PRODUCTS[index] || PRICE_PRODUCTS[0];
}
