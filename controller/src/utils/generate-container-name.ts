import { faker } from "@faker-js/faker";

export function generateContainerName(): string {
  const adjective = faker.word.adjective();
  const animal = faker.animal.type();
  const randomString = faker.string.alphanumeric(5).toLowerCase();

  return `${adjective}-${animal}-${randomString}`;
}
