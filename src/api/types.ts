import type { components } from './schema'

// Noms métier des types générés : un renommage ou une suppression côté API casse la compilation ici.
type Schemas = components['schemas']

export type Recipe = Schemas['RecipeDTO']
export type RecipeRow = Schemas['RecipeRowDTO']
export type RecipeSummary = Schemas['RecipeSummaryDTO']
export type RecipeType = Schemas['RecipeTypeDTO']
export type ShoppingList = Schemas['ShoppingListDetailDTO']
export type ShoppingListSummary = Schemas['ShoppingListDTO']
export type ActiveShoppingListSummary = Schemas['ActiveShoppingListSummaryDTO']
export type Ingredient = Schemas['IngredientDTO']
export type IngredientOption = Schemas['IngredientOptionDTO']
export type Department = Schemas['DepartmentDTO']
export type Unit = Schemas['UnitDTO']
export type CurrentUser = Schemas['CurrentUserDTO']
