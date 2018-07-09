
/* ------------------------------------------- */
/* Character Object Type                       */
/* ------------------------------------------- */

class FTCCharacter extends FTCEntity {

    constructor(obj, context) {
        super(obj, context);

        // Primary Templates
        this.templates = {
            FTC_SKILL_HTML: FTC.TEMPLATE_DIR + 'character/skill.html',
            FTC_ATTRIBUTE_HTML: FTC.TEMPLATE_DIR + 'character/attribute.html',
            INVENTORY_HEADER: FTC.TEMPLATE_DIR + 'character/items/inventory-header.html',
            INVENTORY_ITEM: FTC.TEMPLATE_DIR + 'character/items/item.html',
            FTC_SPELL_LEVEL: FTC.TEMPLATE_DIR + 'character/items/spell-header.html',
            FTC_SPELL_HTML: FTC.TEMPLATE_DIR + 'character/items/spell.html',
            CHARACTER_TAB_TRAITS: FTC.TEMPLATE_DIR + 'character/tab-traits.html',
            CHARACTER_PRIMARY_STATS: FTC.TEMPLATE_DIR + 'character/primary-stats.html',
            CHARACTER_ABILITY: FTC.TEMPLATE_DIR + 'character/ability.html'
        };

        // Register local for debugging
        FTC.character = this;
    }

    /* ------------------------------------------- */
    /* HTML Rendering                              */
    /* ------------------------------------------- */

    refineScope(scope) {
        scope.isPrivate = (scope.viewOnly && (!this.obj || !this.obj.id()));
        return scope;
    }

    /* ------------------------------------------- */

    convertData(data) {

        // Proficiency Bonus
        data.counters.proficiency.current = Math.floor((data.counters.level.current + 7) / 4);
        return data;

    }

    enrichData(data, scope) {

        // Temporary FTC display data
        const ftc = {};
        data.ftc = ftc;

        // Level and Experience
        data.counters.level.current = Math.min(Math.max(data.counters.level.current, 1), 20);
        let lvl = data.counters.level.current,
            start = this.getLevelExp(lvl - 1),
            cur = Math.max(data.counters.exp.current, start),
            next = this.getLevelExp(lvl),
            pct = ((cur - start) * 100) / (next - start);
        ftc['exp'] = {
            "lvl": lvl,
            "current": cur.toLocaleString(),
            "next": next.toLocaleString(),
            "pct": Math.min(pct, 99.5),
            "cls": (pct >= 100) ? "leveled": "",
            "kill": this.getKillExp(data.counters.cr.current)
        };

        // Enrich Attributes
        $.each(data.stats, function(attr, stat) {
            ftc[attr] = {
                'mod': stat.modifiers.mod,
                'svmod': (stat.proficient * data.counters.proficiency.current) + stat.modifiers.mod,
                'padstr': FTC.ui.padNumber(stat.current, 2),
                'modstr': (stat.modifiers.mod < 0 ? "" : "+" ) + stat.modifiers.mod
            }
        });

        // Initiative Bonus
        let initMod = parseInt(data.stats["Dex"].modifiers.mod) + parseInt(data.counters.initiative.current);
        ftc["initiative"] = (initMod < 0 ? initMod : "+"+initMod) + "." + ftc["Dex"].padstr;

        // Spellcasting DC
        let spellAttr = data.info.spellcasting.current,
            mod = spellAttr ? data.ftc[spellAttr].mod : undefined;
        ftc["spellMod"] = mod;
        ftc["spellDC"] = mod ? 8 + mod + data.counters.proficiency.current : undefined;
        ftc["spellDCstr"] = mod ? "Spell DC " + data.ftc["spellDC"] : "";

        // Enrich Skills
        $.each(data.skills, function(name, skill) {
            let stat = data.ftc[skill.stat],
                 mod = ((skill.current || 0) * data.counters.proficiency.current) + stat.mod;
            ftc[name] = {
                'mod': mod,
                'modstr': (mod < 0 ? "" : "+" ) + mod
            }
        });

        // Base Armor Class
        data.ftc["baseAC"] = 10 + data.ftc["Dex"].mod;

        // Set up owned items
        this.setupInventory(data);
        this.setupSpellbook(data);
        this.setupAbilities(data);

        // Return the enriched data
        return data;
    }

    get spellDC() {
        let attr = this.data.info.spellcasting.current,
            mod = this.data.stats[attr].modifiers.mod;
        return 8 + mod + this.data.counters.proficiency.current;
    }

    /* ------------------------------------------- */

    getLevelExp(level) {
        const levels = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
                  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
        return levels[Math.min(level, levels.length - 1)];
    }

    getKillExp(cr) {
        cr = eval(cr);
        if (cr < 1.0) return Math.max(200 * cr, 10);
        let _ = undefined;
        const xps = [10, 200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 18000, 20000, 22000,
            25000, 27500, 30000, 32500, 36500, _, _, _, _, _, 155000];
        return xps[cr];
    }

    /* ------------------------------------------- */

    setupInventory(data) {
        // Set up inventory items by converting them to FTCItem objects

        const ftc = data.ftc,
            owner = this.owner,
            weight = [],
            inventory = {
            "weapons": {
                "name": "Weapons",
                "items": [],
                "type": "weapon"
            },
            "equipment": {
                "name": "Equipment",
                "items": [],
                "type": "armor"
            },
            "tools": {
                "name": "Tools",
                "items": [],
                "type": "item",
            },
            "consumables": {
                "name": "Consumables",
                "items": [],
                "type": "item"
            },
            "pack": {
                "name": "Backpack",
                "items": [],
                "type": "item"
            }
        };

        // Iterate over inventory items
        $.each(data.inventory, function(itemId, itemData) {
            let item = new FTCItem(itemData, {"owner": owner, "container": "inventory"});

            // Set id and class
            item.data.itemId = itemId;
            item.data.itemCls = ( item.type === "weapon" && item.weapon.damage.current ) ?
                "ftc-rollable" : "";

            // Push into type
            if ( item.type === "weapon" ) {
                inventory.weapons.items.push(item);
            } else if ( item.type === "armor" && item.armor.equipped.current === 1 ) {
                inventory.equipment.items.push(item);
            } else if ( item.type === "item" && item.info.variety.current === "tool" ) {
                inventory.tools.items.push(item);
            } else if ( item.type === "item" && item.info.variety.current === "consumable" ) {
                inventory.consumables.items.push(item);
            } else {
                inventory.pack.items.push(item);
            }

            // Record total entry weight
            weight.push(parseFloat(item.info.weight.current) * parseFloat(item.info.quantity.current));
        });
        ftc.inventory = inventory;

        // Compute weight and encumbrance
        let wt = (weight.length > 0) ? weight.reduce(function(total, num) { return total + (num || 0); }) : 0,
           enc = data.stats.Str.current * 15,
           pct = Math.min(wt * 100 / enc, 99.5),
           cls = (pct > 90 ) ? "heavy" : "";
        ftc["weight"] = {"wt": wt.toFixed(2), "enc": enc, "pct": pct.toFixed(2), "cls": cls};
    }

    /* ------------------------------------------- */

    setupSpellbook(data) {
        // Set up spellbook items by converting them to FTCItem objects

        const ftc = data.ftc,
            sls = {};

        // Iterate over spellbook spells
        $.each(data.spellbook, function(spellId, itemData) {

            // Construct the item object
            let item = new FTCItem(itemData, {"owner": this.owner, "container": "spellbook"}),
                spell = item.spell;

            // Construct spell data
            let lvl = (spell.level.current === "Cantrip") ? 0 : parseInt(spell.level.current || 0);
            item.spellid = spellId;

            // Record spell-level
            sls[lvl] = sls[lvl] || {
                "level": lvl,
                "name": (lvl === 0) ? "Cantrip" : FTC.ui.getOrdinalNumber(lvl) + " Level",
                "current": FTC.getProperty(data, 'counters.spell'+lvl+'.current') || 0,
                "max": FTC.getProperty(data, 'counters.spell'+lvl+'.max') || 0,
                "spells": [],
            };
            sls[lvl].current = (lvl === 0) ? "&infin;" : sls[lvl].current;
            sls[lvl].max = (lvl === 0) ? "&infin;" : sls[lvl].max;
            sls[lvl].spells.push(item);
        });
        ftc['spellbook'] = sls;
    }

    /* ------------------------------------------- */

    setupAbilities(data) {
        /* Set up ability items by converting them to FTCItem objects
        */

        const ftc = data.ftc;
        ftc["abilities"] = [];
        $.each(data.abilities, function(itemId, itemData) {
            let item = new FTCItem(itemData, {"owner": this.owner, "container": "abilities"});
            ftc.abilities.push(item);
        });
    }

    /* ------------------------------------------- */

    getTemplate(data, scope) {
        /* Determine the base HTML template that should be used for the entity
        */

        // Private Preview Template
        if ( scope.isPrivate ) return FTC.TEMPLATE_DIR + 'character/preview-character.html';

        // NPC Template

        // Character Sheet
        return FTC.TEMPLATE_DIR + 'character/charsheet.html';
    }

    /* ------------------------------------------- */

    buildHTML(data, scope) {

        // Determine and load primary template
        const template = this.getTemplate(data, scope);
        let main = FTC.loadTemplate(template);

        // Augment sub-components
        if (!scope.isPrivate) {

            // Primary Stats
            main = FTC.injectTemplate(main, "CHARACTER_PRIMARY_STATS", this.templates.CHARACTER_PRIMARY_STATS)

            // Attributes and Skills
            main = this._buildAttributes(main, data);
            main = this._buildSkills(main, data);

            // Owned Items - Inventory, Spells, and Abilities
            main = this._buildInventory(main, data);
            main = this._buildSpellbook(main, data);
            main = this._buildAbilities(main, data);

            // Character Traits
            main = FTC.injectTemplate(main, "CHARACTER_TAB_TRAITS", this.templates.CHARACTER_TAB_TRAITS)
        }
        return main;
    }

    /* ------------------------------------------- */

    _buildAttributes(html, data) {
        let attrs = "",
            template = FTC.loadTemplate(this.templates.FTC_ATTRIBUTE_HTML);
        for ( var s in data.stats ) {
            attrs += template.replace(/\{stat\}/g, s);
        }
        return html.replace("<!-- FTC_ATTRIBUTE_HTML -->", attrs);
    }

    /* ------------------------------------------- */

    _buildSkills(html, data) {
        let skills = "",
            template = FTC.loadTemplate(this.templates.FTC_SKILL_HTML);
        for (var s in data.skills) {
            skills += template.replace(/\{skl\}/g, s);
        }
        return html.replace("<!-- FTC_SKILL_HTML -->", skills);
    }

    /* ------------------------------------------- */

    _buildInventory(html, data) {
        let inventory = "",
            itemHeader = FTC.loadTemplate(this.templates.INVENTORY_HEADER),
            itemTemplate = FTC.loadTemplate(this.templates.INVENTORY_ITEM);
        $.each(data.ftc.inventory, function(_, type) {
            inventory += FTC.populateTemplate(itemHeader, type);
            $.each(type.items, function(_, item) {
                inventory += FTC.populateTemplate(itemTemplate, item.data);
            });
        });
        inventory = inventory || '<li><blockquote class="compendium">Add items from the compendium.</blockquote></li>';
        return html.replace("<!-- FTC_INVENTORY_HTML -->", inventory);
    }

    /* ------------------------------------------- */

    _buildSpellbook(html, data) {
        let spells = "",
            ltmp = FTC.loadTemplate(this.templates.FTC_SPELL_LEVEL),
            stmp = FTC.loadTemplate(this.templates.FTC_SPELL_HTML);
        $.each(data.ftc.spellbook, function(l, s){
            spells += FTC.populateTemplate(ltmp, s);
            $.each(s.spells, function(i, p){
                spells += FTC.populateTemplate(stmp, p);
            });
        });
        spells = spells || '<li><blockquote class="compendium">Add spells from the compendium.</blockquote></li>';
        return html.replace("<!-- FTC_SPELLS_HTML -->", spells);
    }

    /* ------------------------------------------- */

    _buildAbilities(html, data) {
        let abilities = "",
            ab = FTC.loadTemplate(this.templates.CHARACTER_ABILITY);
        $.each(data.ftc.abilities, function(i, item) {
            item.itemid = i;
            abilities += FTC.populateTemplate(ab, item);
        });
        abilities = abilities || '<li><blockquote class="compendium">Add abilities from the compendium.</blockquote></li>';
        return html.replace("<!-- CHARACTER_TAB_ABILITIES -->", abilities);
    }

    /* ------------------------------------------- */

    activateListeners(html, app, scope) {
        const character = this;
        FTC.ui.activateTabs(html, this, app);
        FTC.forms.activateFields(html, this, app);

        // Attribute rolls
        html.find('.attribute .ftc-rollable').click(function() {
            let attr = $(this).parent().attr("data-attribute");
            character.rollAttribute(attr);
        });

        // Skill rolls
        html.find('.skill .ftc-rollable').click(function() {
            let skl = $(this).parent().attr("data-skill");
            character.rollSkillCheck(skl);
        });

        // Weapon actions
        html.find(".weapon .ftc-rollable").click(function() {
            const itemId = $(this).closest("li.weapon").attr("data-item-id"),
                itemData = character.data.inventory[itemId];
            FTCItemAction.toChat(character, itemData);
        });

        // Spell actions
        html.find(".spell .ftc-rollable").click(function() {
            const itemId = $(this).closest("li.spell").attr("data-item-id"),
                itemData = character.data.spellbook[itemId];
            FTCItemAction.toChat(character, itemData);
        });

        // Ability actions
        html.find(".ability .ftc-rollable").click(function() {
            const itemId = $(this).closest("li.ability").attr("data-item-id"),
                itemData = character.data.abilities[itemId];
            FTCItemAction.toChat(character, itemData);
        });
    }

    /* ------------------------------------------- */
    /* Owned Items                                 */
    /* ------------------------------------------- */

    addItem(item, container) {
        const type = item.type;
        if ( !container ) {
            if (["weapon", "armor", "item"].includes(type)) container = "inventory";
            else if ("spell" === type) container = "spellbook";
            else if ("ability" === type) container = "abilities";
        }
        if ( !container ) return;

        // If we are dropping a spell on the inventory tab, it's a "Scroll of ___"
        if ( type === "spell" && FTC.character.data.tabs["content-tabs"] === "tab-inventory" ) {
            item.data.info.name.current = "Scroll of " + item.data.info.name.current;
            item.data.info.type.current = item.types.ITEM_TYPE_DEFAULT;
            item.data.info.variety.current = "consumable";
            container = "inventory";
        }

        // Push the item in
        this.data[container].push(item.data);
        this._changed = true;
        this.save();
    }

    /* ------------------------------------------- */

    updateItem(container, itemId, itemData) {
        this.data[container][itemId] = itemData;
        this._changed = true;
        this.save();
    }

    /* ------------------------------------------- */

    deleteItem(container, itemId) {
        this.data[container].splice(itemId, 1);
        this._changed = true;
        this.save();
    }

    /* ------------------------------------------- */
    /* Character Actions                           */
    /* ------------------------------------------- */

    getCoreData() {
        /* This function exists to prepare all the standard rules data that would be used by dice rolling in D&D5e.
        */

        // Reference actor data
        let data = {
            "proficiency": this.data.counters.proficiency.current,
            "spellcasting": this.data.info.spellcasting.current || "Int",
            "offensive": this.data.info.offensive.current || "Str"
        };

        // Attribute modifiers
        $.each(this.data.stats, function(a, s) {
            data[a] = {
                "name": s.name,
                "prof": (s.proficient || 0) * data.proficiency,
                "value": s.current,
                "mod": s.modifiers.mod,
            }
        });

        // Skill modifiers
        $.each(this.data.skills, function(n, s) {
            data[n] = {
                "name": s.name,
                "prof": (s.current || 0) * data.proficiency,
                "mod": data[s.stat].mod
            }
        });

        // Spell DC
        data["spellDC"] = 8 + data.proficiency + data[data.spellcasting].mod;

        // Weapon Mod and Spell Mod
        data["weaponMod"] = data[data.offensive].mod;
        data["spellMod"] = data[data.spellcasting].mod;

        // Armor Class
        data["baseAC"] = 10 + data["Dex"].mod;
        return data;
    };

    /* -------------------------------------------- */

    rollAttribute(attr) {
        /* Initial dialog to prompt between rolling an Attribute Test or Saving Throw
        */

        const actor = this;
        const html = $('<div id="ftc-dialog"><p>What type of roll?</p></div>');

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: actor.data.stats[attr].name + " Roll",
            buttons: {
                "Attribute Test": function () {
                    $(this).dialog("close");
                    $(this).dialog("destroy");
                    actor.rollAttributeTest(attr);
                },
                "Saving Throw": function () {
                    $(this).dialog("close");
                    $(this).dialog("destroy");
                    actor.rollAttributeSave(attr);
                }
            }
        });
    }

    /* -------------------------------------------- */

    rollAttributeTest(attr) {
        /* Roll an Attribute Test
        */

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            name = data[attr].name,
            flavor = name + " Test",
            adv = undefined,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attribute-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Roll With advantage?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Advantage": function () {
                    adv = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Disadvantage": function () {
                    adv = false;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                let formula = FTC.Dice.formula(FTC.Dice.d20(adv), "@mod", bonus);
                if ( adv !== undefined ) flavor += ( adv ) ? " (Advantage)": " (Disadvantage)";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data[attr].mod});
            }
        });
    }

    /* -------------------------------------------- */

    rollAttributeSave(attr) {
        /* Roll a Saving Throw
        */

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            name = data[attr].name,
            flavor = name + " Save",
            adv = undefined,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attribute-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Roll With advantage?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Advantage": function () {
                    adv = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Disadvantage": function () {
                    adv = false;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                let formula = FTC.Dice.formula(FTC.Dice.d20(adv), "@mod", "@prof", bonus);
                if ( adv !== undefined ) flavor += ( adv ) ? " (Advantage)": " (Disadvantage)";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data[attr].mod, "prof": data[attr].prof});
            }
        });
    }

    /* -------------------------------------------- */

    rollSkillCheck(skl) {
        /* Roll a skill check, prompting for advantage/disadvantage as well as situational modifiers
        */

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            name = data[skl].name,
            flavor = name + " Check",
            adv = undefined,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="skill-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Roll With advantage?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Advantage": function () {
                    adv = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Disadvantage": function () {
                    adv = false;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                let formula = FTC.Dice.formula(FTC.Dice.d20(adv), "@mod", "@prof", bonus);
                if ( adv !== undefined ) flavor += ( adv ) ? " (Advantage)": " (Disadvantage)";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data[skl].mod, "prof": data[skl].prof});
            }
        });
    }

    /* -------------------------------------------- */

    rollWeaponAttack(flavor, hit) {
        /* Roll a weapon attack, prompting for advantage/disadvantage as well as situational bonuses
        */

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            adv = undefined,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attack-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Attack With advantage?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Advantage": function () {
                    adv = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Disadvantage": function () {
                    adv = false;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                let formula = FTC.Dice.formula(FTC.Dice.d20(adv), hit, "@mod", "@prof", bonus);
                if ( adv !== undefined ) flavor += ( adv ) ? " (Advantage)": " (Disadvantage)";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data.weaponMod, "prof": data.proficiency});
            }
        });
    }

    /* -------------------------------------------- */

    rollWeaponDamage(flavor, damage) {

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            crit = false,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attack-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Was your attack a critical hit?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Critical Hit!": function () {
                    crit = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                damage = crit ? FTC.Dice.crit(damage) : damage;
                bonus = crit ? FTC.Dice.crit(bonus) : bonus;
                let formula = FTC.Dice.formula(damage, "@mod", bonus);
                flavor += crit ? " (Critical Hit)" : "";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data.weaponMod});
            }
        });
    }

    /* -------------------------------------------- */

    rollSpellAttack(flavor) {
        /*
        Roll a spell attack, prompting for advantage/disadvantage as well as situational bonuses
        */

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            adv = undefined,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attack-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));
        html.append($('<label>Attack With advantage?</label>'));

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: {
                "Advantage": function () {
                    adv = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Disadvantage": function () {
                    adv = false;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            },
            close: function () {
                html.dialog("destroy");
                let formula = FTC.Dice.formula(FTC.Dice.d20(adv), "@mod", "@prof", bonus);
                if ( adv !== undefined ) flavor += ( adv ) ? " (Advantage)": " (Disadvantage)";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data.spellMod, "prof": data.proficiency});
            }
        });
    }

    /* -------------------------------------------- */

    rollSpellDamage(flavor, damage, canCrit) {

        // Prepare core data
        let actor = this,
            data = this.getCoreData(),
            buttons = {},
            crit = false,
            bonus = undefined;

        // Prepare HTML form
        const html = $('<div id="ftc-dialog" class="attack-roll"></div>');
        html.append($('<label>Situational Modifier?</label>'));
        html.append($('<input type="text" id="roll-bonus" placeholder="Formula"/>'));

        // Some spells cannot critically hit, so they should just roll directly
        if ( canCrit ) {
            buttons = {
                "Normal": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                },
                "Critical Hit!": function () {
                    crit = true;
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            };
            html.append($('<label>Was your attack a critical hit?</label>'));
        } else {
            buttons = {
                "Roll Damage": function () {
                    bonus = $(this).find('#roll-bonus').val();
                    $(this).dialog("close");
                }
            };
        }

        // Create a dialogue
        FTC.ui.createDialogue(html, {
            title: flavor,
            buttons: buttons,
            close: function () {
                html.dialog("destroy");
                damage = crit ? FTC.Dice.crit(damage) : damage;
                bonus = crit ? FTC.Dice.crit(bonus) : bonus;
                let formula = FTC.Dice.formula(damage, bonus);
                flavor += crit ? " (Critical Hit)" : "";
                FTC.Dice.roll(actor, flavor, formula, {"mod": data.spellMod});
            }
        });
    }
}


/* -------------------------------------------- */
/* Character Sheet Sync Render                  */
/* -------------------------------------------- */

sync.render("FTC_CHARSHEET", function (obj, app, scope) {
    if ( game.templates.identifier !== FTC_SYSTEM_IDENTIFIER ) {
        return $("<div>Sorry, no preview available at the moment.</div>");
    }
    const char = new FTCCharacter(obj);
    return char.renderHTML(app, scope);
});

