export function validateEmail(value: string) {
  const email = value.trim();
  if (!email) {
    return "Adres email jest wymagany";
  }
  if (!email.includes("@")) {
    return "Adres email musi zawierać znak @";
  }
  return "";
}

export function validatePassword(value: string, minLength = 10) {
  if (!value.trim()) {
    return "Hasło jest wymagane";
  }
  if (value.length < minLength) {
    return `Hasło musi mieć co najmniej ${minLength} znaków`;
  }
  return "";
}

export function validateFullName(value: string) {
  const fullName = value.trim();
  if (!fullName) {
    return "Imię i nazwisko jest wymagane";
  }
  if (fullName.split(/\s+/).length < 2) {
    return "Proszę podać imię i nazwisko";
  }
  return "";
}

export function validateOrganizationSlug(value: string) {
  const slug = value.trim();
  if (!slug) {
    return "Skrót organizacji jest wymagany";
  }
  if (/\s/.test(slug)) {
    return "Skrót organizacji nie może zawierać spacji";
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "Skrót może zawierać tylko małe litery, cyfry i myślniki";
  }
  return "";
}
