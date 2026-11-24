import type { StyleModule } from '../core/native-styles';

/**
 * Every GeoGuessr CSS module BetterGEO reads or reuses, identified by the local class
 * names it uses from each one. This is the only place native class names are named.
 *
 * A signature must match exactly one module on the live site; `npm run check:site`
 * verifies that. When GeoGuessr renames a class, update the signature here.
 */
const spec = (name: string, signature: string[], near?: StyleModule): StyleModule => ({
  name,
  signature,
  near,
});

export const profile = spec('profile', [
  'staticWidgets',
  'widgetRow',
  'proBadgeWrapper',
  'proBadge',
  'headerMainContent',
]);
/** Shared widget frame: border, header row and right-hand slot. */
export const widget = spec('widget', [
  'root',
  'compact',
  'widgetBorder',
  'hasLoaded',
  'widgetOuter',
  'widgetInner',
  'header',
  'title',
  'dividerWrapper',
  'rightSlot',
]);
/** Profile widget contents: icon + title row and carousel body. */
export const profileWidget = spec('profile widget', [
  'header',
  'icon',
  'headerContent',
  'widgetData',
  'statContainer',
  'widgetCarousel',
]);
export const headline = spec('headline', ['heading', 'italic', 'balanceTextWrap']);
export const typography = spec('typography', ['boldWeight', 'white60Variant']);
export const button = spec('button', [
  'button',
  'variantTertiary',
  'sizeSmall',
  'wrapper',
  'label',
  'loadingIndicator',
]);
export const carousel = spec('carousel', [
  'carouselContainer',
  'carouselWrapper',
  'carouselInner',
  'spread',
  'indicatorWrapper',
  'indicator',
  'green',
  'red',
  'active',
  'arrowButton',
  'leftArrowButton',
  'rightArrowButton',
  'arrowSvg',
]);
export const historyModal = spec('game history modal', [
  'root',
  'divisionHeader',
  'divisionHeaderText',
  'dropdownContainer',
  'dropdown',
  'leaderboardWrapper',
  'separator',
  'carouselRoot',
  'carouselItem',
]);
export const historyList = spec('game history list', ['root', 'leaderboardContainer', 'list']);
export const historyItem = spec('game history item', [
  'item',
  'link',
  'card',
  'cardOverlay',
  'arrow',
  'tie',
  'primaryUserWon',
  'opponentWon',
  'gameData',
  'gameDataSide',
  'gameDataSideLeft',
  'gameDataSideRight',
  'avatarCell',
  'centerColumn',
  'mode',
  'vs',
  'date',
]);
export const historyPlayer = spec(
  'game history player',
  ['left', 'right', 'victory', 'defeat', 'tie', 'rating', 'ratingLabel'],
  historyItem,
);
export const historyNick = spec('game history nick', ['root', 'identity', 'nick'], historyItem);
export const avatar = spec('avatar', [
  'titleAvatar',
  'titleAvatarImage',
  'titleAvatarBorder',
  'titleAvatarBorderImage',
  'image',
]);
export const select = spec('select', [
  'dropdown',
  'select',
  'sizeDefault',
  'variantLightTransparent',
  'arrow',
]);
export const overlayModal = spec('overlay modal', [
  'backlight',
  'backlightDark',
  'isAnimated',
  'blurBackground',
  'contentContainer',
  'alignVerticallyCenter',
  'content',
  'sizeLarge',
  'fullHeight',
  'closeButton',
  'closeButtonWhite',
]);
export const overlayPortal = spec('overlay portal', ['destination', 'destinationWithinChrome']);
export const layout = spec('layout', ['fullOverlay', 'sidebar', 'mainOverlay']);
export const spacer = spec('spacer', ['space', 'height', 'xlHeight']);
/** Header navigation item and its dropdown panel. */
export const menu = spec('header menu', ['dropdownContainer', 'dropdown', 'hoverEffect']);
export const menuItem = spec('header menu item', [
  'dropdownItem',
  'noBorder',
  'image',
  'title',
  'description',
]);
export const errorPage = spec('error page', [
  'errorPage',
  'heading',
  'title',
  'cta',
  'illustration',
]);
/** Map page "My games" score history. */
export const mapScores = spec('map scores', [
  'rowContainer',
  'row',
  'cellDate',
  'cellPoints',
  'expandButton',
]);

export const allModules: readonly StyleModule[] = [
  profile,
  widget,
  profileWidget,
  headline,
  typography,
  button,
  carousel,
  historyModal,
  historyList,
  historyItem,
  historyPlayer,
  historyNick,
  avatar,
  select,
  overlayModal,
  overlayPortal,
  layout,
  spacer,
  menu,
  menuItem,
  errorPage,
  mapScores,
];

/** Content-addressed GeoGuessr images; these survive redeploys. */
const media = (hash: string, width = 512) =>
  `/images/resize:fit:${width}:0/gravity:ce/plain/media/sha256/${hash}.webp`;
export const images = {
  recentDuels: media('715db2907508a299c7054a05234d6832456b64fd15e5512d223d6ffe2d90fd0e'),
  rankedDuels: media('faee11a802cc9615cfe4351bd91a72afa6fe3f1cb757b4e41a87cb3b0eb1d8bb'),
  maps: media('601548a6eee2222041bb0e8dac00d949b88b740ef8cc4b06c9e890b2f58459ff', 128),
};
