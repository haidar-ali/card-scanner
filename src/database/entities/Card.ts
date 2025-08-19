import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Card {
  @PrimaryColumn()
  id!: string; // Scryfall UUID

  @Column()
  name!: string;

  @Column()
  setCode!: string;

  @Column()
  collectorNumber!: string;

  @Column({ nullable: true })
  rarity?: string;

  @Column('simple-array', { nullable: true })
  colors?: string[];

  @Column({ nullable: true })
  manaCost?: string;

  @Column({ nullable: true })
  typeLine?: string;

  @Column('text', { nullable: true })
  oracleText?: string;

  @Column({ nullable: true })
  power?: string;

  @Column({ nullable: true })
  toughness?: string;

  @Column({ nullable: true })
  imageUri?: string;

  @Column({ nullable: true })
  imageUriSmall?: string;

  @Column({ nullable: true })
  imageUriNormal?: string;

  @Column({ nullable: true })
  imageUriLarge?: string;

  @Column('decimal', { nullable: true })
  priceUsd?: number;

  @Column('decimal', { nullable: true })
  priceEur?: number;

  @Column({ default: 1 })
  quantity!: number;

  @Column({ default: 'NM' })
  condition!: string; // NM, LP, MP, HP, DMG

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  dateAdded!: Date;

  @UpdateDateColumn()
  lastUpdated!: Date;

  @Column({ nullable: true })
  scryfallUri?: string;

  @Column({ nullable: true })
  cmc?: number;

  @Column({ nullable: true })
  legalities?: string; // JSON string of legalities

  @Column({ nullable: true })
  setName?: string;

  @Column({ nullable: true })
  artist?: string;
}