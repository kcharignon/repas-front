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
export type IngredientPayload = Schemas['IngredientPayload']

// Ingrédients : doublons possibles et fusion (ING-005, ING-006, ING-007)
export type DuplicatePair = Schemas['DuplicateIngredientDTO']
export type DuplicateSide = Schemas['DuplicateIngredientSideDTO']
export type MergeCandidate = Schemas['MergeCandidateDTO']
export type MergePreview = Schemas['MergePreviewDTO']
export type MergeUnit = Schemas['MergeUnitDTO']

// Ingrédients : les conversions propres à un ingrédient et les conversions de tous (lecture seule)
export type IngredientConversion = Schemas['IngredientConversionDTO']
export type IngredientConversions = Schemas['IngredientConversionsDTO']
export type IngredientConversionPayload = Schemas['IngredientConversionPayload']

// Ingrédients à régler : l'unité des recettes ne se convertit pas en unité d'achat (back #301)
export type IngredientToFix = Schemas['IngredientToFixDTO']
export type IngredientsToFix = Schemas['IngredientsToFixDTO']

export type Department = Schemas['DepartmentDTO']
export type Unit = Schemas['UnitDTO']
export type UnitPayload = Schemas['UnitPayload']
export type Dimension = Schemas['Dimension']
export type CurrentUser = Schemas['CurrentUserDTO']
export type UserSummary = Schemas['UserSummaryDTO']
export type UserStatus = UserSummary['status']
export type DriveSettings = Schemas['DriveSettingsDTO']
export type DrivePlan = Schemas['DrivePlanDTO']
export type DrivePlanLine = Schemas['DrivePlanLineDTO']
export type DrivePlanProduct = Schemas['DrivePlanProductDTO']
export type ChoiceIntent = Schemas['ChoiceIntentPayload']

// Drive : les préférences de produits (DRV-208, DRV-410)
export type DriveChoice = Schemas['ChoiceDTO']
export type DriveChoiceProduct = Schemas['ChoiceProductDTO']
export type DriveChoicePayload = Schemas['ReplaceIngredientPreferencePayload']

// Drive : le magasin enregistré (DRV-203, DRV-403)
export type DriveStore = Schemas['DriveStoreDTO']

// Drive : l'estimation du coût d'une liste (DRV-611, DRV-612)
export type DriveEstimate = Schemas['DriveEstimateDTO']
export type DriveEstimateLine = Schemas['DriveEstimateLineDTO']
export type DriveEstimateStatus = DriveEstimateLine['status']
export type DriveStorePayload = Schemas['DriveStorePayload']

// Commande vocale Alexa : la liaison du compte (VOX-401) et les liaisons de l'utilisateur (VOX-402)
export type AlexaAuthorizationPayload = Schemas['IssueAuthorizationCodePayload']
export type VoiceLink = Schemas['VoiceLinkDTO']
