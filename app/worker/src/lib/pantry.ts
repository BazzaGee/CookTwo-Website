export interface ParsedPantryItem {
  name: string;
  quantity: string;
}

const QUANTITY_PATTERNS = [
  /^(\d+(?:\.\d+)?)\s*(cups?|tbsp|tsp|lbs?|oz|kg|g|ml|l|pieces?|slices?|cans?|bags?|boxes?|bottles?|jars?|packs?)/i,
  /^(half|quarter|third)\s*(of\s*)?an?\s*/i,
  /^(\d+)\/(\d+)\s*/i,
];

function extractQuantity(text: string): { quantity: string; remainder: string } {
  const trimmed = text.trim();

  for (const pattern of QUANTITY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const quantity = match[0].trim();
      const remainder = trimmed.slice(quantity.length).trim();
      if (remainder) {
        return { quantity, remainder };
      }
    }
  }

  return { quantity: '', remainder: trimmed };
}

export function parsePantryInput(input: string): ParsedPantryItem[] {
  const parts = input.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);

  return parts.map((part) => {
    const { quantity, remainder } = extractQuantity(part);
    return {
      name: remainder || part,
      quantity,
    };
  }).filter((item) => item.name.length > 0);
}
