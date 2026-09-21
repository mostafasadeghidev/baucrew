import { describe, expect, it } from 'vitest'
import {
  changesFor,
  cleanMasterMapping,
  guessMapping,
  mapMasterRow,
  mappingComplete,
  matchKey,
  splitFullName,
} from '@/lib/import-master'

describe('guessMapping', () => {
  it('reads the headers a German office export has', () => {
    const headers = ['Kd.-Nr.', 'Name', 'Firma', 'Straße', 'PLZ', 'Ort', 'Telefon', 'E-Mail', 'Umsatz']
    expect(guessMapping('customers', headers)).toEqual({
      number: 'Kd.-Nr.',
      name: 'Name',
      company: 'Firma',
      street: 'Straße',
      postalCode: 'PLZ',
      city: 'Ort',
      phone: 'Telefon',
      email: 'E-Mail',
    })
  })

  it('uses a header once, and prefers first and last name over a whole name', () => {
    expect(guessMapping('employees', ['Name', 'Vorname', 'Nachname', 'Mobil'])).toEqual({
      firstName: 'Vorname',
      lastName: 'Nachname',
      phone: 'Mobil',
    })
    expect(guessMapping('employees', ['Mitarbeiter', 'Handy'])).toEqual({ fullName: 'Mitarbeiter', phone: 'Handy' })
    expect(guessMapping('vehicles', ['Fahrzeug', 'Kennzeichen', 'Typ'])).toEqual({ name: 'Fahrzeug', licensePlate: 'Kennzeichen', type: 'Typ' })
  })
})

describe('mappingComplete', () => {
  it('wants the name a record cannot do without', () => {
    expect(mappingComplete('customers', { number: 'Nr' })).toBe(false)
    expect(mappingComplete('customers', { name: 'Name' })).toBe(true)
    expect(mappingComplete('employees', { firstName: 'Vorname' })).toBe(false)
    expect(mappingComplete('employees', { firstName: 'Vorname', lastName: 'Nachname' })).toBe(true)
    expect(mappingComplete('employees', { fullName: 'Name' })).toBe(true)
  })
})

describe('cleanMasterMapping', () => {
  it('keeps the fields of the kind and nothing else', () => {
    expect(cleanMasterMapping('vehicles', { name: 'Fahrzeug', number: 'Nr', type: '', licensePlate: 5 })).toEqual({ name: 'Fahrzeug' })
    expect(cleanMasterMapping('customers', null)).toEqual({})
  })
})

describe('splitFullName', () => {
  it('reads both ways of writing a name', () => {
    expect(splitFullName('Max Muster')).toEqual({ firstName: 'Max', lastName: 'Muster' })
    expect(splitFullName('Muster, Max')).toEqual({ firstName: 'Max', lastName: 'Muster' })
    expect(splitFullName('Anna Maria  Beispiel')).toEqual({ firstName: 'Anna Maria', lastName: 'Beispiel' })
    expect(splitFullName('Muster')).toEqual({ firstName: '', lastName: 'Muster' })
  })
})

describe('mapMasterRow', () => {
  const headers = ['Nr', 'Name', 'Tel', 'Leer']

  it('makes a record of a row, numbers as text, empty as null', () => {
    expect(mapMasterRow('customers', headers, [4711, ' Muster GmbH ', '01234 567890', ''], { number: 'Nr', name: 'Name', phone: 'Tel', city: 'Leer' })).toMatchObject({
      number: '4711',
      name: 'Muster GmbH',
      phone: '01234 567890',
      city: null,
      email: null,
    })
  })

  it('drops a row without a name', () => {
    expect(mapMasterRow('customers', headers, [4711, '  ', '', ''], { number: 'Nr', name: 'Name' })).toBeNull()
    expect(mapMasterRow('vehicles', headers, [1, null, '', ''], { name: 'Name' })).toBeNull()
  })

  it('splits a whole name for an employee and keeps a single name as the last name', () => {
    expect(mapMasterRow('employees', ['Name'], ['Muster, Max'], { fullName: 'Name' })).toMatchObject({ firstName: 'Max', lastName: 'Muster' })
    expect(mapMasterRow('employees', ['Name'], ['Beispiel'], { fullName: 'Name' })).toMatchObject({ firstName: null, lastName: 'Beispiel' })
    expect(mapMasterRow('employees', ['Vorname', 'Nachname'], ['Max', ''], { firstName: 'Vorname', lastName: 'Nachname' })).toMatchObject({ firstName: null, lastName: 'Max' })
    expect(mapMasterRow('employees', ['Name'], [''], { fullName: 'Name' })).toBeNull()
  })
})

describe('matchKey', () => {
  it('goes by the number or the plate where there is one, else by the name', () => {
    expect(matchKey('customers', { name: 'Muster GmbH', number: ' K-4711 ' })).toEqual({ by: 'number', key: 'k-4711' })
    expect(matchKey('customers', { name: '  Muster   GmbH ', number: null })).toEqual({ by: 'name', key: 'muster gmbh' })
    expect(matchKey('vehicles', { name: 'Bus', licensePlate: 'XX-AB 123' })).toEqual({ by: 'plate', key: 'xxab123' })
    expect(matchKey('employees', { firstName: 'Max', lastName: 'MUSTER' })).toEqual({ by: 'name', key: 'max|muster' })
  })
})

describe('changesFor', () => {
  const existing = { name: 'Muster GmbH', phone: '01234 1', city: '', email: null }

  it('fills what is empty and leaves what the office entered', () => {
    expect(changesFor(existing, { name: 'Muster GmbH', phone: '01234 2', city: 'Musterstadt', email: 'info@muster.example', street: null }, false)).toEqual({
      city: 'Musterstadt',
      email: 'info@muster.example',
    })
  })

  it('overwrites what differs when told to', () => {
    expect(changesFor(existing, { name: 'Muster GmbH', phone: '01234 2', city: null }, true)).toEqual({ phone: '01234 2' })
  })
})
