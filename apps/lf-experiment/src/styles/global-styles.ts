/**
 * Global Styles Module
 * 
 * Creates a single CSSStyleSheet instance from @maxhill/css that is:
 * 1. Adopted on the document for Light DOM styling
 * 2. Shared with Shadow DOM components that need global styles (like .button, .form, etc.)
 * 
 * This approach ensures zero duplication - the stylesheet is parsed once and reused everywhere.
 */

import globalCSS from "@maxhill/css?inline";
import projectCSS from "../main.css?inline";

// Create the global stylesheet from @maxhill/css package
export const globalStyleSheet = new CSSStyleSheet();
globalStyleSheet.replaceSync(globalCSS);

// Create project-specific stylesheet (includes :root variables and body styles)
const projectStyleSheet = new CSSStyleSheet();
projectStyleSheet.replaceSync(projectCSS);

// Adopt both stylesheets on the document for Light DOM
// Order: project styles first (for CSS variables), then global styles
document.adoptedStyleSheets = [projectStyleSheet, globalStyleSheet];

// Export for use in Shadow DOM components
// Components should import { globalStyleSheet } and add it to their adoptedStyleSheets
