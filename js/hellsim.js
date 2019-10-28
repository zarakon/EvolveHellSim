function Simulate() {
    $('#result').val("");

    var params = GetParams();
    var ticks;
    const ticks_per_bloodwar = 20;
    
    var sim = {
        tick: 0,
        ticks: 0,
        tickLength: 250,
        threat: params.threat,
        patrols: params.patrols,
        soldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        maxSoldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        hellSoldiers: params.patrols * params.patrolSize + params.defenders,
        maxHellSoldiers: params.patrols * params.patrolSize + params.defenders,
        wounded: 0,
        trainingProgress: 0,
        surveyors: params.surveyors,
        carRepair: 0,
        siegeOdds: 999,
        walls: 100,
        wallRepair: 0,
        pity: 0,
        eventOdds: 999,
        outputStr: "",
    };
    
    var stats = {
        soulGems: 0,
        totalPreFightThreat: 0,
        minPreFightThreat: params.threat,
        maxPreFightThreat: params.threat,
        totalPostFightThreat: 0,
        minPostFightThreat: params.threat,
        maxPostFightThreat: params.threat,
        bloodWars: 0,
        patrolEncounters: 0,
        skippedEncounters: 0,
        ambushes: 0,
        soldiersTrained: 0,
        soldiersKilled: 0,
        totalWounded: 0,
        maxWounded: 0,
        ambushDeaths: 0,
        minReserves: params.garrison + params.defenders,
        surges: 0,
        sieges: 0,
        totalWalls: 0,
        minWalls: 100,
        totalSurveyors: 0,
        minSurveyors: params.surveyors,
    };
    
    sim.tickLength = 250;
    if (params.hyper) {
        sim.tickLength *= 0.95;
    }
    if (params.slow) {
        sim.tickLength *= 1.1;
    }
    
    sim.ticks = params.hours * 3600 * 1000 / sim.tickLength;

    if (params.verbose) {
        for (var item in params) {
            let str = "".concat(item, " - ", params[item], "\n");
            LogResult(sim, str);
        }
    }
    
    //LogResult(sim, ''.concat("tickLength ", sim.tickLength, "ms  ticks ", sim.ticks, "  bloodwars ", sim.ticks/20, "\n"));


    while (sim.tick < sim.ticks) {
        if (sim.tick % ticks_per_bloodwar == 0) {
            /* Fight demons */
            BloodWar(params, sim, stats);
            
            /* End the sim if all patrols are dead or the walls fell */
            if (sim.patrols == 0 || sim.walls == 0) {
                break;
            }
            
            if (sim.wounded > 0) {
                HealSoldiers(params, sim, stats);
            }
            
            /* Random events, which could mean a demon surge influx */
            Events(params, sim, stats);
        }
        
        if (sim.soldiers < sim.maxSoldiers) {
            TrainSoldiers(params, sim, stats);
        }
        
        stats.totalSurveyors += sim.surveyors;
        stats.minSurveyors = Math.min(stats.minSurveyors, sim.surveyors);
        if (sim.surveyors < params.surveyors) {
            RepairSurveyors(params, sim, stats);
        }
        
        /* Repair walls */
        if (sim.walls < 100) {
            sim.wallRepair++;
            if (sim.wallRepair >= 200) {
                sim.wallRepair = 0;
                sim.walls++;
            }
        }
        
        sim.tick++;
    }
    
    let hours = (sim.tick * sim.tickLength / 1000) / 3600;
    
    LogResult(sim, "\n -- Results --\n");
    LogResult(sim, "Blood wars:  " + stats.bloodWars + "\n");
    LogResult(sim, "Soul gems:   " + stats.soulGems +
            ",  per hour: " + (stats.soulGems / hours).toFixed(3) +
            "\n");
    LogResult(sim, "Encounters:  " + stats.patrolEncounters +
            ",  per hour: " + (stats.patrolEncounters / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.patrolEncounters / stats.bloodWars).toFixed(3) +
            ",  skipped: " + (stats.skippedEncounters / (stats.skippedEncounters + stats.patrolEncounters) * 100).toFixed(2) + "%" +
            "\n");
    LogResult(sim, "Ambushes:    " + stats.ambushes +
            ",  per hour: " + (stats.ambushes / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.ambushes / stats.bloodWars).toFixed(3) +
            ",  per encounter: " + (stats.ambushes / stats.patrolEncounters).toFixed(3) +
            "\n");
    LogResult(sim, "Surges:      " + stats.surges +
            ",  per hour: " + (stats.surges / hours).toFixed(3) +
            "\n");
    LogResult(sim, "Sieges:      " + stats.sieges +
            ",  per hour: " + (stats.sieges / hours).toFixed(3) +
            "\n");
    LogResult(sim, "Pre-fight Threat   Avg: " + (stats.totalPreFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPreFightThreat +
            ",  max: " + stats.maxPreFightThreat +
            "\n");
    LogResult(sim, "Post-fight Threat  Avg: " + (stats.totalPostFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPostFightThreat +
            ",  max: " + stats.maxPostFightThreat +
            "\n");
    LogResult(sim, "Soldiers trained: " + stats.soldiersTrained +
            ",  per hour: " + (stats.soldiersTrained / hours).toFixed(1) +
            "\n");
    LogResult(sim, "Soldiers killed: " + stats.soldiersKilled +
            ",  per hour: " + (stats.soldiersKilled / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.soldiersKilled / stats.bloodWars).toFixed(3) +
            ",  in ambushes: " + (stats.ambushDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
            "\n");
    LogResult(sim, "Wounded avg: " + (stats.totalWounded / stats.bloodWars).toFixed(1) +
            ",  max " + stats.maxWounded + " of " + sim.maxSoldiers +
            "\n");
    LogResult(sim, "Surveyors avg: " + (stats.totalSurveyors / sim.tick).toFixed(1) +
            " (" + Math.round((stats.totalSurveyors / sim.tick) / params.surveyors * 100) + "%)" +
            ",  min " + stats.minSurveyors + " of " + params.surveyors +
            "\n");
    LogResult(sim, "Walls avg: " + (stats.totalWalls / stats.bloodWars).toFixed(1) +
            ",  min " + stats.minWalls +
            "\n");
    LogResult(sim, "Defenders: " + (sim.hellSoldiers - sim.patrols * params.patrolSize) + 
            ",  Garrison: " + (sim.soldiers - sim.hellSoldiers) + 
            ",  Walls: " + sim.walls + 
            "\n");
    LogResult(sim, "Patrols remaining: " + sim.patrols + " out of " + params.patrols + "\n");
    
    $('#result')[0].scrollIntoView(true);
    $('#result')[0].value = sim.outputStr;
    $('#result').scrollTop($('#result')[0].scrollHeight);
}

function BloodWar(params, sim, stats) {
    stats.bloodWars++;
    stats.totalPreFightThreat += sim.threat;
    if (sim.threat < stats.minPreFightThreat) {
        stats.minPreFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPreFightThreat) {
        stats.maxPreFightThreat = sim.threat;
    }
    let preFightThreat = sim.threat;
    
    stats.totalWounded += sim.wounded;
    if (sim.wounded > stats.maxWounded) {
        stats.maxWounded = sim.wounded;
    }
    
    LogVerbose(sim, params,
        "T " + sim.tick + 
        " ; soldiers " + sim.soldiers +
        " ; hellSoldiers " + sim.hellSoldiers +
        " ; threat " + sim.threat);

    /* Drone Strikes */
    for (let i = 0; i < params.predators; i++) {
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            let kills = Rand(25, 75);
            if (kills < demons) {
                sim.threat -= kills;
            } else {
                sim.threat -= demons;
            }
        }
    }
    
    /* Gem Chance */
    let gemOdds = 10000 - sim.pity;
    if (params.darkEnergy >= 1) {
        gemOdds -= Math.round(Math.log2(params.darkEnergy) * 2);
    }
    for (let i = 0; i < params.beacons; i++) {
        gemOdds = Math.round(gemOdds * 0.92);
    }
    
    /* Patrols */
    let soldiersKilled = 0;
    let needPity = false;
    for (let i = 0; i < sim.patrols; i++) {
        /* Check for encounter
           Less demons -> lower chance of encounter
         */
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            /* Encounter */
            stats.patrolEncounters++;
            
            let patrolSize = params.patrolSize;
            /* Add droids if available */
            if (i < params.droids) {
                patrolSize++;
            }
            
            let patrolRating = ArmyRating(params, sim, patrolSize);

            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            
            let ambushOdds = params.chameleon ? 50 : 30;
            if (Rand(0, ambushOdds) == 0) {
                /* Ambush 
                   Patrol armor is ignored, at least one will be killed/injured, and no chance for a soul gem
                 */
                stats.ambushes++;

                soldiersKilled += PatrolCasualties(params, sim, stats, demons, true);
                let demonsKilled = Math.round(patrolRating / 2);
                if (demonsKilled < demons) {
                    sim.threat -= demonsKilled;
                } else {
                    sim.threat -= demons;
                }
            } else {
                /* Normal encounter */
                let demonsKilled = patrolRating;
                if (demonsKilled < demons) {
                    /* Suffer casualties if the patrol didn't kill all of the demons */
                    soldiersKilled += PatrolCasualties(params, sim, stats, (demons - demonsKilled), false);
                    sim.threat -= demonsKilled;
                } else {
                    sim.threat -= demons;
                }
                
                /* Chance to find a soul gem */
                if (Rand(0, gemOdds) == 0) {
                    stats.soulGems++;
                    sim.pity = 0;
                } else {
                    needPity = true;
                }
                
            }
        } else {
            /* Skipped encounter */
            stats.skippedEncounters++;
        }
    }

    stats.totalPostFightThreat += sim.threat;
    if (sim.threat < stats.minPostFightThreat) {
        stats.minPostFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPostFightThreat) {
        stats.maxPostFightThreat = sim.threat;
    }

    /* Pity */
    if (needPity && sim.pity < 10000) {
        sim.pity++;
    }

    LogVerbose(sim, params,
        " ; postThreat " + sim.threat +
        " ; dead " + soldiersKilled +
        " ; pity " + sim.pity +
        " ; gemOdds " + gemOdds +
        "\n");
    
    /* Siege */
    if (params.sieges) {
        sim.siegeOdds--;
        if (Rand(0, sim.siegeOdds) == 0) {
            stats.sieges++;
            let demons = Math.round(sim.threat / 2);
            let defense = FortressRating(params, sim);
     
            LogResult(sim, TimeStr(sim) + " - " +
                "Siege -- Demons " + demons +
                ",  Fortress rating " + defense);

            defense = Math.max(1, defense / 35);
            
            
            
            while (demons > 0 && sim.walls > 0) {
                let kills = Math.round(Rand(1, defense+1));
                demons -= Math.min(kills, demons);
                if (demons > 0) {
                    sim.walls--;
                    if (sim.walls == 0) {
                        break;
                    }
                }
            }
            LogResult(sim, ",  Walls " + sim.walls + "\n");
            
            if (sim.walls == 0) {
                LogResult(sim, "!!! Walls fell at " + TimeStr(sim) + " !!!\n");
            }
            
            sim.siegeOdds = 999;
        }
    }
    
    stats.totalWalls += sim.walls;
    stats.minWalls = Math.min(stats.minWalls, sim.walls);
    
    /* Demon influx */
    if (sim.threat < 10000) {
        let influx = ((10000 - sim.threat) / 2500) + 1;
        influx *= 1 + (params.beacons * 0.22);
        influx = Math.round(influx);
        sim.threat += Rand(influx * 10, influx * 50);
    }
    

    /* Surveyors */
    if (sim.surveyors > 0) {
        let danger = sim.threat / 1000;
        let exposure = Math.min(10, sim.surveyors);
        let risk = 10 - Rand(0, exposure+1);
        
        if (danger > risk) {
            let cap = Math.round(danger);
            let dead = Rand(0, cap+1);
            sim.surveyors -= Math.min(dead, sim.surveyors);
        }
    }



}

function Events(params, sim, stats) {
    /* A minimum of 4 events will always be possible:
        Inspiration, Raid/Terrorist, Demon Influx, Ruins
       The Fire event is possible if not kindred kindling, aquatic, or evil
       Slaver trait adds three more possible events for slave deaths
    */    
    let numEvents = 4;
    
    if (!(params.kindling || params.evil || params.aquatic)) {
        numEvents++;
    }
    if (params.slaver) {
        numEvents += 3;
    }
    
    if (Rand(0, sim.eventOdds) == 0) {
        let event = Rand(0, numEvents);
        if (event == 0) {
            /* Demon surge event, if enabled by user */
            if (params.surges) {
                let surge = Rand(2500, 5000);
                sim.threat += surge;
                stats.surges++;
                LogResult(sim, TimeStr(sim) + " - Demon Surge Event!  " + surge + " new demons, new threat total " + sim.threat + "\n");
            }
        } else if (event == 1) {
            /* Terrorist attack or enemy raid.  Equivalent for our purposes here */
            if (params.terrorists) {
                let killed = Rand(0, sim.wounded);
                let wounded = Rand(sim.wounded, sim.soldiers);
                
                sim.soldiers -= killed;
                sim.wounded += wounded;
                
                if (sim.wounded > sim.soldiers) {
                    sim.wounded = sim.soldiers;
                }

                LogResult(sim, TimeStr(sim) + " - Terrorist attack: " + wounded + " wounded, " + killed + " killed.\n");
            }
        } /* else, irrelevant event */
        /* Reset event odds */
        sim.eventOdds = 999;
    } else {
        /* No event, increase the odds */
        sim.eventOdds--;
    }
}

function TrainSoldiers(params, sim, stats) {
    if (sim.soldiers >= sim.maxSoldiers) {
        return;
    }
    
    sim.trainingProgress += 100 / TrainingTime(params);
    
    if (sim.trainingProgress >= 100) {
        sim.soldiers++;
        stats.soldiersTrained++;
        sim.trainingProgress = 0;
        if (sim.hellSoldiers < sim.maxHellSoldiers) {
            sim.hellSoldiers++;
        }
    }
}

function HealSoldiers(params, sim, stats) {
    if (sim.wounded <= 0) {
        return;
    }

    var healed = 1;
    
    if (params.regenerative) {
        healed = 4;
    }
    
    var healCredits = params.hospitals;
    if (params.bacTanks) {
        healCredits *= 2;
    }
    healCredits += params.fibroblast * 2;
    if (params.cannibal) {
        healCredits += 3;
    }
    
    healed += Math.floor(healCredits / 20);
    healCredits = healCredits % 20;
    if (Rand(0, healCredits) > Rand(0, 20)) {
        healed++;
    }
    
    sim.wounded -= healed;
    if (sim.wounded < 0) {
        sim.wounded = 0;
    }
}

function RepairSurveyors(params, sim, stats) {
    if (sim.surveyors >= params.surveyors) {
        return;
    }
    
    sim.carRepair++;
    if (sim.carRepair >= 180) {
        sim.carRepair = 0;
        sim.surveyors++;
    }
}

function PatrolCasualties(params, sim, stats, demons, ambush) {
    var armor;
    if (ambush) {
        /* Armor is ineffective in an ambush, and demons are stronger */
        armor = 0;
        demons = Math.round(demons * (1 + Math.random() * 3));
    } else {
        armor = params.armorTech;
        if (params.apexPredator) {
            armor = 0;
        }
        if (params.armored) {
            armor += 2;
        }
        if (params.scales) {
            armor += 1;
        }
    }
    
    let casualties = Math.round(Math.log2((demons / params.patrolSize) / (armor || 1))) - Rand(0, armor);
    let dead = 0;
    
    if (casualties > 0) {
        if (casualties > params.patrolSize) {
            casualties = params.patrolSize;
        }
        casualties = Rand((ambush ? 1 : 0), (casualties + 1));
        dead = Rand(0, (casualties + 1));
        let wounded = casualties - dead;
        sim.wounded += wounded;
        sim.soldiers -= dead;
        stats.soldiersKilled += dead;
        if (ambush) {
            stats.ambushDeaths += dead;
        }
    }
    
    if (sim.wounded > sim.soldiers) {
        sim.wounded = sim.soldiers;
    }
    
    if (sim.soldiers < sim.hellSoldiers) {
        sim.hellSoldiers = sim.soldiers;
    }
    
    /* If all reserves are gone, reduce the number of patrols.  This is permanent. */
    if (sim.hellSoldiers < sim.patrols * params.patrolSize) {
        sim.patrols = Math.floor(sim.hellSoldiers / params.patrolSize);
        LogResult(sim, TimeStr(sim) + " - Lost patrol. " + sim.patrols + " remaining.  Threat: " + sim.threat + "\n");
        if (sim.patrols == 0) {
            LogResult(sim, "!!! Lost all patrols at " + TimeStr(sim) + " !!!\n");
        }
    }
    
    return dead;
}

/* Returns soldier training time in ticks, not rounded */
function TrainingTime(params) {
    var rate;
    var bootCampBonus;

    bootCampBonus = params.vrTraining == true ? 0.08 : 0.05;
    
    /* rate is percentage points per tick */
    rate = params.diverse ? 2.0 : 2.5;
    rate *= 1 + params.bootCamps * bootCampBonus;
    if (params.brute) {
        rate += 2.5;
    }
    rate *= 0.25;
    
    /* Convert to ticks per soldier */
    rate /= 100.0;
    return 1.0/rate;
}

function ArmyRating(params, sim, size) {
    var rating = size;
    var wounded = 0;
    
    if (sim) {
        if (size > sim.soldiers - sim.wounded) {
            wounded = size - (sim.soldiers - sim.wounded);
        }
    }
    rating -= wounded / 2;

    rating *= params.weaponTech;
    
    if (params.puny) {
        rating *= 0.9;
    }
    if (params.claws) {
        rating *= 1.2;
    }
    if (params.chameleon) {
        rating *= 1.2;
    }
    // if (params.cautious && weather stuff)
    if (params.apexPredator) {
        rating *= 1.25;
    }
    if (params.fiery) {
        rating *= 1.65;
    }
    if (params.pathetic) {
        rating *= 0.75;
    }
    if (params.rage) {
        rating *= 1.05;
    }

    rating *= 1 + (params.tactical * 0.05);
    
    rating *= 1 + (params.temples * 0.01);
    
    if (params.parasite) {
        if (size == 1) {
            rating += 2;
        } else if (size > 1) {
            rating += 4;
        }
    }
    
    rating = Math.floor(rating);
    
    if (params.hivemind) {
        if (size <= 10) {
            rating *= (size * 0.05) + 0.5;
        } else {
            rating *= 1 + (1 - (0.99 ** (size - 10)));
        }
    }
    
    if (params.cannibal) {
        rating *= 1.15;
    }
    
    return Math.round(rating);
}

function FortressRating(params, sim) {
    var turretRating;
    var patrols;
    var defenders;
    
    if (sim) {
        patrols = sim.patrols;
        defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
    } else {
        patrols = params.patrols;
        defenders = params.defenders;
    }
    
    if (params.droids > patrols) {
        defenders += (params.droids - patrols);
    }
    
    switch (params.turretTech) {
        case 0:
            turretRating = 35;
            break;
        case 1:
            turretRating = 50;
            break;
        case 2:
        default:
            turretRating = 70;
            break;
    }
    
    return ArmyRating(params, sim, defenders) + params.turrets * turretRating;
}

function OnChange() {
    var params = GetParams();
    var patrolRating;
    var patrolRatingDroids;
    var fortressRating;
    var trainingTime;
    
    patrolRating = ArmyRating(params, false, params.patrolSize);
    patrolRatingDroids = ArmyRating(params, false, params.patrolSize + 1);
    
    if (params.droids >= params.patrols) {
        $('#patrolRating').val(patrolRatingDroids);
    } else if (params.droids > 0) {
        $('#patrolRating').val(''.concat(patrolRating, " / ", patrolRatingDroids));
    } else {
        $('#patrolRating').val(patrolRating);
    }
    
    fortressRating = FortressRating(params, false);
    $('#fortressRating').val(fortressRating);
    
    /* Get the training time, then round up to next tick and convert to seconds */
    trainingTime = TrainingTime(params);
    trainingTime = Math.ceil(trainingTime) / 4;
    if (params.hyper) {
        trainingTime *= 0.95;
    }
    if (params.slow) {
        trainingTime *= 1.1;
    }
    let trainingRate = 3600 / trainingTime;
    $('#trainingRate').val(''.concat(trainingTime.toFixed(2), "sec  ", trainingRate.toFixed(1), "/hour"));
    
    
    /* Save params to localStorage */
    window.localStorage.setItem('hellSimParams', JSON.stringify(params));
}

function LogResult(sim, str) {
    if (sim) {
        sim.outputStr += str;
    } else {
        let result = $('#result');
        //result.val(result.val().concat(str));
        result[0].value += str;
        result.scrollTop(result[0].scrollHeight);
    }
}

function LogVerbose(sim, params, str) {
    if (!params.verbose) return;
    LogResult(sim, str);
}

function TimeStr(sim) {
    let seconds = Math.round(sim.tick * sim.tickLength / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    
    let str = "";
    
    if (hours < 100) {
        str += "0";
    }
    if (hours < 10) {
        str += "0";
    }
    str += hours.toString() + ":";
    if (minutes < 10) {
        str += "0";
    }
    str += minutes.toString() + ":";
    if (seconds < 10) {
        str += "0";
    }
    str += seconds.toString();
    
    return str;
}

/* Pull parameter values from the form */
function GetParams() {
    var params = {};

    $('.param').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        if (el.attr('type') == "checkbox") {
            if (jQuery(el).is(":checked")) {
                params[id] = true;
            } else {
                params[id] = false;
            }
        } else if (el.val() == "true") {
            params[id] = true;
        } else if (el.val() == "false") {
            params[id] = false;
        } else {
            params[id] = Number(el.val());
        }
    });
    
    return params;
}

/* Fill parameter values back to the form */
function SetParams(params) {
    /*
    $('.param').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        if (el.attr('type') == "checkbox") {
            el[0].checked = params[id];
        } else {
            el.val(params[id]);
        }
    });
    */
    for (const key of Object.keys(params)) {
        let id = "#" + key;
        let el = $(id);
        if (el.attr('type') == "checkbox") {
            el[0].checked = params[key];
        } else {
            el.val(params[key].toString());
        }
    }
}

function Rand(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function ImportSave() {
    if ($('#saveString').val().length > 0){
        let saveState = JSON.parse(LZString.decompressFromBase64($('#saveString').val()));
        if (saveState && 'evolution' in saveState && 'settings' in saveState && 'stats' in saveState && 'plasmid' in saveState.stats){
            ConvertSave(saveState);
            $('#result').val("Import successful!\n");
        } else {
            $('#result').val("Invalid save string\n");
        }
    } else {
        $('#result').val("Import requires save string\n");
    }
    $('#saveString').val("")
}

function ConvertSave(save) {
    console.log(save);
    
    /* Fill form fields based on Evolve save data */
    $('#apexPredator')[0].checked = save.race['apex_predator'] ? true : false;
    $('#aquatic')[0].checked = (save.race.species == "sharkin" || save.race.species == "octigoran");
    $('#armored')[0].checked = save.race['armored'] ? true : false;
    $('#brute')[0].checked = save.race['brute'] ? true : false;
    $('#cannibal')[0].checked = save.race['cannibalize'] ? true : false;
    $('#cautious')[0].checked = save.race['cautious'] ? true : false;
    $('#chameleon')[0].checked = save.race['chameleon'] ? true : false;
    $('#claws')[0].checked = save.race['claws'] ? true : false;
    $('#diverse')[0].checked = save.race['diverse'] ? true : false;
    $('#evil')[0].checked = save.race['evil'] ? true : false;
    $('#fiery')[0].checked = save.race['fiery'] ? true : false;
    $('#hivemind')[0].checked = save.race['hivemind'] ? true : false;
    $('#hyper')[0].checked = save.race['hyper'] ? true : false;
    $('#kindling')[0].checked = save.race['kindling_kindred'] ? true : false;
    $('#parasite')[0].checked = save.race['parasite'] ? true : false;
    $('#pathetic')[0].checked = save.race['pathetic'] ? true : false;
    $('#puny')[0].checked = save.race['puny'] ? true : false;
    $('#rage')[0].checked = save.city.ptrait == 'rage' ? true : false;
    $('#regenerative')[0].checked = save.race['regenerative'] ? true : false;
    $('#scales')[0].checked = save.race['scales'] ? true : false;
    $('#slaver')[0].checked = save.race['slaver'] ? true : false;
    $('#slow')[0].checked = save.race['slow'] ? true : false;
    
    $('#weaponTech')[0].value = save.tech['military'] >= 5 ? save.tech['military'] - 1 : save.tech['military'];
    $('#armorTech')[0].value = save.tech['armor'];
    $('#tactical')[0].value = save.race.minor['tactical'] || 0;
    $('#temples')[0].value = save.tech['fanaticism'] >= 4 ? save.city.temple.count : 0;
    $('#bootCamps')[0].value = save.city.boot_camp.count;
    $('#vrTraining')[0].value = save.tech['boot_camp'] >= 2 ? true : false;
    $('#hospitals')[0].value = save.city.hospital.count;
    $('#bacTanks')[0].value = save.tech['medic'] >= 2 ? true : false;
    $('#fibroblast')[0].value = save.race['fibroblast'] || 0;
    $('#darkEnergy')[0].value = save.race.universe == 'evil' ? global.race.Dark.count : 0;
    
    if (save.portal && save.portal.fortress) {
        let patrols = save.portal.fortress.patrols;
        let patrolSize = save.portal.fortress.patrol_size;
        let defenders = save.portal.fortress.assigned - (patrols * patrolSize);
        let garrison = save.civic.garrison.max - save.portal.fortress.assigned;
        $('#patrols')[0].value = patrols;
        $('#patrolSize')[0].value = patrolSize;
        $('#defenders')[0].value = defenders;
        $('#garrison')[0].value = garrison;
        $('#beacons')[0].value = save.portal.attractor ? save.portal.attractor.on : 0;
        $('#predators')[0].value = save.portal.war_drone ? save.portal.war_drone.on : 0;
        $('#droids')[0].value = save.portal.war_droid ? save.portal.war_droid.on : 0;
        $('#surveyors')[0].value = save.portal.carport ? save.portal.carport.count : 0;
        $('#turrets')[0].value = save.portal.turret ? save.portal.turret.on : 0;
        $('#turretTech')[0].value = save.tech['turret'] ? save.tech['turret'] : 1;
    }
    OnChange();
}

$(document).ready(function() {
    console.log("I'm ready");
    $('#result').val("Ready\n");
    
    $('#paramsForm').submit(function(event) {
        event.preventDefault();
        setTimeout(Simulate, 20);
    });
    
    $('#importForm').submit(function(event) {
        event.preventDefault();
        ImportSave();
    });
    
    $('input').on('change', function() {
        OnChange();
    });
    $('select').on('change', function() {
        OnChange();
    });
    
    /* Load params from localStorage */
    paramStr = window.localStorage.getItem('hellSimParams') || false;
    if (paramStr) {
        params = JSON.parse(paramStr);
        SetParams(params);
    }

    OnChange();
});


/*
var WarSim = {};

$('[data-name=test] input').each(function(index, element) {
 
    var el = $(element);
    WarSim[el.attr('name')] = el.val();

});
*/
/*
    Traits:                     
        Apex Predator (sharkin)
        Armored (tortoise)
        Brute (orc)
        Cannibal (Mantis)
        Cautious (animal)
        Claws (scorpid)
        Diverse (human)
        Fiery (balorg)
        Hivemind (antid)
        Hyper (cacti)
        Parasite (sporgar)
        Pathetic (imp)
        Puny (gnome)
        Rage (planet)
        Scales (reptile)
        Slow (tortoise)
    Civ Params:
        Boot camps              entry
        VR Training             checkbox
        Weapon tech level       combobox
        Armor tech level        combobox
        Tactical gene level     entry
        Fanatical temples       entry
        Dark energy (if evil universe)  entry
    Hell Setup:
        Patrols                 entry
        Patrol size             entry
        Fortress reserves       entry
        Homeworld reserves      entry
        Attractors              entry
        Predator Drones         entry
        War Droids              entry
        -Turrets                entry
        -Turret tech level      combobox
        -Surveyors              entry
    Sim Options:
        Initial threat          entry
        Sim hours               entry
        Demon surges            checkbox
        -Sieges
        
    Results:
        Soul gems total
        Soul gems per hour
        Average demons (displayed)
        Average demons (pre-influx)
        Soldier death rate
        Reserves minimum
        Reserves average
        Patrols remaining
        -Avg living surveyors
        -Walls minimum
    Immediate UI feedback:
        Patrol rating (with/without droids)
        Soldier recruit time
        -Fortress defense rating
        
*/