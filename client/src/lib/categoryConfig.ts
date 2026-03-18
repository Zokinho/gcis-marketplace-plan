/**
 * Category-based field visibility config for CreateListing form.
 *
 * Maps each product category to a group (flower / concentrates / edibles / other)
 * and defines which form fields are required, optional, or hidden per group.
 */

export type CategoryGroup = 'flower' | 'concentrates' | 'edibles' | 'other';
export type FieldVisibility = 'required' | 'optional' | 'hidden';

/** Every conditional field in the CreateListing form. */
export type ConditionalField =
  | 'type'
  | 'lineage'
  | 'harvestDate'
  | 'growthMedium'
  | 'certifications'
  | 'thc'
  | 'cbd'
  | 'terpenes'
  | 'budSizes'
  | 'upcomingQty'
  | 'minQtyRequest'
  | 'images'
  | 'coaFiles';

export type FieldConfig = Record<ConditionalField, FieldVisibility>;

const CATEGORY_GROUP_MAP: Record<string, CategoryGroup> = {
  // Flower
  'Cannabis flowers (mix sizes)': 'flower',
  'Cannabis flowers (smalls only)': 'flower',
  'Cannabis flowers (fresh frozen)': 'flower',
  'Cannabis flowers (outdoor grown)': 'flower',
  'Cannabis flowers (outdoor fresh frozen)': 'flower',
  'Milled Flower': 'flower',
  'Cannabis trimmings': 'flower',
  // Concentrates
  'Cannabis kief': 'concentrates',
  'Cannabis cured rosins and cured resins': 'concentrates',
  'Cannabis hashish': 'concentrates',
  'Cannabis live rosin and live resin': 'concentrates',
  'Cannabinoid isolates': 'concentrates',
  'Cannabinoid distillates': 'concentrates',
  "Cannabis crude oils ('resins')": 'concentrates',
  'THCa diamonds': 'concentrates',
  // Flower (THCa)
  'THCa flowers': 'flower',
  // Edibles
  'Chocolates': 'edibles',
  'Gummies': 'edibles',
  'Edibles (others)': 'edibles',
  // Other
  'Genetics': 'other',
};

const GROUP_FIELDS: Record<CategoryGroup, FieldConfig> = {
  flower: {
    type: 'optional',
    lineage: 'required',
    harvestDate: 'required',
    growthMedium: 'optional',
    certifications: 'required',
    thc: 'required',
    cbd: 'optional',
    terpenes: 'required',
    budSizes: 'optional',
    upcomingQty: 'required',
    minQtyRequest: 'required',
    images: 'required',
    coaFiles: 'required',
  },
  concentrates: {
    type: 'optional',
    lineage: 'hidden',
    harvestDate: 'hidden',
    growthMedium: 'hidden',
    certifications: 'optional',
    thc: 'required',
    cbd: 'optional',
    terpenes: 'hidden',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'optional',
  },
  edibles: {
    type: 'hidden',
    lineage: 'hidden',
    harvestDate: 'hidden',
    growthMedium: 'hidden',
    certifications: 'optional',
    thc: 'optional',
    cbd: 'optional',
    terpenes: 'hidden',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'optional',
  },
  other: {
    type: 'optional',
    lineage: 'optional',
    harvestDate: 'optional',
    growthMedium: 'hidden',
    certifications: 'optional',
    thc: 'optional',
    cbd: 'optional',
    terpenes: 'optional',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'optional',
  },
};

/** Returns the category group for a given category string, or null if unknown/empty. */
export function getCategoryGroup(category: string): CategoryGroup | null {
  if (!category) return null;
  return CATEGORY_GROUP_MAP[category] ?? null;
}

/** Returns field visibility config for a given category, or null if no category selected. */
export function getFieldConfig(category: string): FieldConfig | null {
  const group = getCategoryGroup(category);
  if (!group) return null;
  return GROUP_FIELDS[group];
}
