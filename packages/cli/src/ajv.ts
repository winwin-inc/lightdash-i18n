import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const ajv = new Ajv({
    coerceTypes: true,
    allErrors: true,
    allowUnionTypes: true,
    discriminator: true,
    strict: false,
});
addFormats(ajv);
