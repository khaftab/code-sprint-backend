import { faker } from "@faker-js/faker";
function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}

export function generateContainerName(): string {
  const adjective = sanitize(faker.word.adjective());
  const animal = sanitize(faker.animal.type());
  const randomString = faker.string.alphanumeric(7).toLowerCase();

  return `${adjective}-${animal}-${randomString}`;
}
