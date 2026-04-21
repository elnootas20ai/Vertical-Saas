import { Router } from 'express';
import { listLocations, createLocation, updateLocation, removeLocation } from '../controllers/locationsController.js';

const locationsRouter = Router();

locationsRouter.get('/:userId', listLocations);
locationsRouter.post('/:userId', createLocation);
locationsRouter.put('/:userId/:locationId', updateLocation);
locationsRouter.delete('/:userId/:locationId', removeLocation);

export { locationsRouter };
