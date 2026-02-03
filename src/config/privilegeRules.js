export const INCOMPATIBILITIES = {
  male: ["female"],
  female: ["male", "minServ", "elder"],
  auxPioneer: ["regPioneer", "specPioneer", "sfs"],
  regPioneer: ["auxPioneer", "specPioneer", "sfs"],
  specPioneer: ["auxPioneer", "regPioneer", "sfs"],
  minServ: ["female", "elder"],
  elder: ["female", "minServ"],
  sfs: ["auxPioneer", "regPioneer", "specPioneer"],
};

export function isValidPrivilegeCombination(selected) {
  const unique = [...new Set(selected)];
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    for (let j = i + 1; j < unique.length; j++) {
      const b = unique[j];
      const aBad = INCOMPATIBILITIES[a] || [];
      const bBad = INCOMPATIBILITIES[b] || [];
      if (aBad.includes(b) || bBad.includes(a)) {
        return false;
      }
    }
  }
  return true;
}
