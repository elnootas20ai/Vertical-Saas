/**
 * Alias de brandsApi (misma caché / mismos endpoints).
 * Preferir importar desde `./brandsApi` en código nuevo.
 */
export {
  type Brand,
  listBrandsRequest,
  createBrandRequest,
  updateBrandRequest,
  deleteBrandRequest,
  invalidateBrandsListCache,
} from './brandsApi';
