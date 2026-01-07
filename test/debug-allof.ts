import { readFileSync } from 'fs';
import path from 'path';

import { OpenApiConverter } from '../src/core/ir';
import { OpenApiDocument } from '../src/core/parser';

const openapiDoc: OpenApiDocument = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/complex.json'), 'utf-8'),
);

const converter = new OpenApiConverter(openapiDoc);
const converted = converter.convert();

const userProfile = converted.models.find((m) => m.name === 'UserProfile');
console.log('\n=== UserProfile ===');
console.log('Extends:', userProfile?.extends);
console.log(
  'Properties:',
  userProfile?.properties.map((p) => p.name),
);
console.log('Total properties:', userProfile?.properties.length);

const userSettings = converted.models.find((m) => m.name === 'UserSettings');
console.log('\n=== UserSettings ===');
console.log('Extends:', userSettings?.extends);
console.log(
  'Properties:',
  userSettings?.properties.map((p) => p.name),
);
console.log('Total properties:', userSettings?.properties.length);

const cat = converted.models.find((m) => m.name === 'Cat');
console.log('\n=== Cat ===');
console.log('Extends:', cat?.extends);
console.log(
  'Properties:',
  cat?.properties.map((p) => p.name),
);
console.log('Total properties:', cat?.properties.length);

const dog = converted.models.find((m) => m.name === 'Dog');
console.log('\n=== Dog ===');
console.log('Extends:', dog?.extends);
console.log(
  'Properties:',
  dog?.properties.map((p) => p.name),
);
console.log('Total properties:', dog?.properties.length);

const user = converted.models.find((m) => m.name === 'User');
console.log('\n=== User ===');
console.log('Extends:', user?.extends);
console.log(
  'Properties:',
  user?.properties.map((p) => p.name),
);
console.log('Total properties:', user?.properties.length);
