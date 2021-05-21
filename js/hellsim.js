var gStop = false;

function Simulate() {
    $('#result').val("");

    console.log("Simulate " + Date.now());
    
    /* Change the Simulate button to a Stop button. */
    let btnWidth = $('#simButton').width();
    $('#simButton').text("Stop");
    $('#simButton').width(btnWidth);
    $('#paramsForm').unbind("submit");
    $('#paramsForm').submit(function(event) {
        event.preventDefault();
        gStop = true;
    });

    var params = GetParams();
    
    var stats = {
        outputStr: "",
        ticks: 0,
        tickLength: 0,
        simsDone: 0,
        patrolGems: 0,
        forgeGems: 0,
        gunGems: 0,
        gateGems: 0,
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
        soldiersRevived: 0,
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
        wallFails: 0,
        wallFailTicks: 0,
        patrolFails: 0,
        patrolFailTicks: 0,
        totalPatrolsSurvived: 0,
        minPatrolsSurvived: params.patrols,
        maxPatrolsSurvived: 0,
        totalPity: 0,
        totalPityPerGem: 0,
        maxPity: 0,
        totalGarrison: 0,
        kills: 0,
        forgeOn: 0,
        forgeSouls: 0,
        mercCosts: 0,
        mercsHired: 0,
        mercMaxPrice: 0,
        minMoney: params.moneyCap,
    };
    
    stats.tickLength = 250;
    if (params.hyper) {
        stats.tickLength *= 0.95;
    }
    if (params.slow) {
        stats.tickLength *= 1.1;
    }
    
    SimScheduler(params, false, stats);
}

function SimScheduler(params, sim, stats) {
    if (gStop) {
        SimCancel(params, stats);
    } else if (stats.simsDone < params.sims) {
        setTimeout(function() {
            SimRun(params, sim, stats);
        }, 0);
    } else {
        SimResults(params, stats);
    }
    UpdateProgressBar(params, sim, stats);
}

function UpdateProgressBar(params, sim, stats) {
    let progressPct = stats.simsDone / params.sims * 100.0;
    if (sim && !sim.done) {
        let partialProgress = (sim.tick / sim.ticks) / params.sims * 100.0;
        progressPct += partialProgress;
    }
    $('#simProgress').attr("aria-valuenow",Math.floor(progressPct));
    $('#simProgress').css("width", progressPct + "%");
}

function SimRun(params, sim, stats) {
    const ticks_per_bloodwar = 20;
    if (!sim || sim.done) {
        sim = {
            tick: 0,
            ticks: Math.round(params.hours * 3600 * 1000 / stats.tickLength),
            tickLength: stats.tickLength,
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
            forgeSouls: 0,
            money: params.moneyCap,
            mercCounter: 0,
            clickerCounter: 0,
            lastEvent: -1,
            done: false,
        };
        if (params.soulForge == 2) {
            let forgeSoldiers = ForgeSoldiers(params);
            sim.soldiers += forgeSoldiers;
            sim.maxSoldiers += forgeSoldiers;
            sim.hellSoldiers += forgeSoldiers;
            sim.maxHellSoldiers += forgeSoldiers;
        }
        let simNum = stats.simsDone + 1;
        LogResult(stats, " -- Sim " + simNum.toString().padStart(Math.floor(Math.log10(params.sims)) + 1, 0) + " --\n");
    }
    
    var startTime = Date.now();
    
    while (sim.tick < sim.ticks) {
        if (sim.tick % ticks_per_bloodwar == 0) {
            /* Fight demons */
            BloodWar(params, sim, stats);
            
            /* End the sim if all patrols are dead or the walls fell */
            if (sim.walls == 0) {
                stats.wallFails++;
                stats.wallFailTicks += sim.tick;
                break;
            } else if (sim.patrols == 0 && params.patrols != 0) {
                stats.patrolFails++;
                stats.patrolFailTicks += sim.tick;
                break;
            }
            
            if (sim.wounded > 0) {
                HealSoldiers(params, sim, stats);
            }
            
            /* Random events, which could mean a demon surge influx */
            Events(params, sim, stats);
            
            /* 1/4 chance to reduce merc counter */
            if (sim.mercCounter > 0) {
                if (Rand(0,3) == 0) {
                    sim.mercCounter--;
                }
            }
        }
        
        if (sim.soldiers < sim.maxSoldiers) {
            TrainSoldiers(params, sim, stats);
        }
        sim.money += params.moneyIncome * (stats.tickLength / 1000);
        if (sim.money > params.moneyCap) {
            sim.money = params.moneyCap;
        }
        if (params.hireMercs != 0) {
            HireMercs(params, sim, stats);
        }
        stats.totalGarrison += (sim.soldiers - sim.hellSoldiers);
        
        stats.totalSurveyors += sim.surveyors;
        stats.minSurveyors = Math.min(stats.minSurveyors, sim.surveyors);
        if (sim.surveyors < params.surveyors) {
            RepairSurveyors(params, sim, stats);
        }
        
        /* Repair walls */
        if (sim.walls < 100) {
            let repair = 200;
            if (params.repairDroids > 0) {
                repair *= 0.95 ** params.repairDroids;
                repair = Math.round(repair);
            }
            sim.wallRepair++;
            if (sim.wallRepair >= repair) {
                sim.wallRepair = 0;
                sim.walls++;
            }
        }
        
        sim.tick++;
        stats.ticks++;
        
        let msElapsed = Date.now() - startTime;
        if (msElapsed > 50) {
            /* Yield CPU */
            SimScheduler(params, sim, stats);
            return;
        }
        
        if (gStop) {
            SimCancel(params, stats);
            return;
        }
    }
    if (sim.tick >= sim.ticks) {
        LogResult(stats, "Survived!\n");
        LogResult(stats, "Defenders: " + (sim.hellSoldiers - sim.patrols * params.patrolSize) + 
            ",  Garrison: " + (sim.soldiers - sim.hellSoldiers) + 
            ",  Walls: " + sim.walls + 
            "\n");
        LogResult(stats, "Patrols remaining: " + sim.patrols + " out of " + params.patrols + "\n");
        LogResult(stats, "\n");
    }
    
    stats.totalPatrolsSurvived += sim.patrols;
    stats.minPatrolsSurvived = Math.min(sim.patrols, stats.minPatrolsSurvived);
    stats.maxPatrolsSurvived = Math.max(sim.patrols, stats.maxPatrolsSurvived);
    
    sim.done = true;
    stats.simsDone++;
    
    $('#result')[0].value = stats.outputStr;
    $('#result').scrollTop($('#result')[0].scrollHeight);

    SimScheduler(params, sim, stats);
}

function SimCancel(params, stats) {
    console.log("Canceled " + Date.now());
    LogResult(stats, "!!! Canceled !!!\n\n");
    SimResults(params, stats);
    gStop = false;
}

function SimResults(params, stats) {
    let ticksPerHour = stats.tickLength / 1000 / 3600;
    let hours = (stats.ticks * stats.tickLength / 1000) / 3600;
    let maxSoldiers = params.patrols * params.patrolSize + params.defenders + params.garrison;
    
    LogResult(stats, " -- Results --\n");
    LogResult(stats, "Sims:  " + stats.simsDone +
            ",  wall failures: " + stats.wallFails + 
            (stats.wallFails ? " (avg " + (stats.wallFailTicks * ticksPerHour / stats.wallFails).toFixed(1) + " hrs)" : "") +
            ",  patrol failures: " + stats.patrolFails +
            (stats.patrolFails ? " (avg " + (stats.patrolFailTicks * ticksPerHour / stats.patrolFails).toFixed(1) + " hrs)" : "") +
            "\n");
    LogResult(stats, "Soul gems per hour - Patrols: " + (stats.patrolGems / hours).toFixed(2) +
            ",  Guns: " + (stats.gunGems / hours).toFixed(2) +
            ",  Forge: " + (stats.forgeGems / hours).toFixed(2) +
            ",  Gate Turrets: " + (stats.gateGems / hours).toFixed(2) +
            ",  Total: " + ((stats.patrolGems + stats.gunGems + stats.forgeGems + stats.gateGems) / hours).toFixed(2) +
            "\n");
    LogResult(stats, "Encounters:  " + stats.patrolEncounters +
            ",  per hour: " + (stats.patrolEncounters / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.patrolEncounters / stats.bloodWars).toFixed(3) +
            ",  skipped: " + (stats.skippedEncounters / (stats.skippedEncounters + stats.patrolEncounters) * 100).toFixed(2) + "%" +
            "\n");
    LogResult(stats, "Pre-fight Threat   Avg: " + (stats.totalPreFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPreFightThreat +
            ",  max: " + stats.maxPreFightThreat +
            "\n");
    LogResult(stats, "Post-fight Threat  Avg: " + (stats.totalPostFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPostFightThreat +
            ",  max: " + stats.maxPostFightThreat +
            "\n");
    LogResult(stats, "Soldiers killed per hour: " + (stats.soldiersKilled / hours).toFixed(1));
    if (params.revive) {
        LogResult(stats,
            ", after revives: " + ((stats.soldiersKilled - stats.soldiersRevived) / hours).toFixed(1)); 
    }
    LogResult(stats,
            ",  per bloodwar: " + (stats.soldiersKilled / stats.bloodWars).toFixed(3) +
            ",  in ambushes: " + (stats.ambushDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
            "\n");
    if (params.hireMercs != 0) {
        LogResult(stats,
            "Mercs hired per hour: " + (stats.mercsHired / hours).toFixed(1) +
            ", avg cost: " + (stats.mercCosts / stats.mercsHired).toFixed(3) +
            ", max cost: " + stats.mercMaxPrice.toFixed(3) +
            ", min money " + stats.minMoney.toFixed(2) +
            "\n");
    }
    LogResult(stats, "Patrols survived (of " + params.patrols +
            ")  avg: " + (stats.totalPatrolsSurvived / stats.simsDone).toFixed(1) +
            ",  min: " + stats.minPatrolsSurvived +
            ",  max: " + stats.maxPatrolsSurvived +
            "\n");
    LogResult(stats, "Surveyors avg: " + (stats.totalSurveyors / stats.ticks).toFixed(1) +
            " (" + ((stats.totalSurveyors / stats.ticks) / params.surveyors * 100).toFixed(1) + "%)" +
            ",  min " + stats.minSurveyors + " of " + params.surveyors +
            "\n");
    LogResult(stats, "Hunting Garrison avg: " + (stats.totalGarrison / stats.ticks).toFixed(1) +
            " of " + params.garrison +
            " (" + ((stats.totalGarrison / stats.ticks) / params.garrison * 100).toFixed(1) + "%)" +
            "\n");
    LogResult(stats, "Walls avg: " + (stats.totalWalls / stats.bloodWars).toFixed(1) +
            ",  min " + stats.minWalls +
            "\n");
    
    if (params.extraResults) {
        LogResult(stats, "Blood wars:  " + stats.bloodWars + "\n");
        LogResult(stats, "Ambushes:    " + stats.ambushes +
            ",  per hour: " + (stats.ambushes / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.ambushes / stats.bloodWars).toFixed(3) +
            ",  per encounter: " + (stats.ambushes / stats.patrolEncounters).toFixed(3) +
            "\n");
        LogResult(stats, "Surges:      " + stats.surges +
            ",  per hour: " + (stats.surges / hours).toFixed(3) +
            "\n");
        LogResult(stats, "Sieges:      " + stats.sieges +
            ",  per hour: " + (stats.sieges / hours).toFixed(3) +
            "\n");
        LogResult(stats, "Soldiers trained: " + stats.soldiersTrained +
            ",  per hour: " + (stats.soldiersTrained / hours).toFixed(1) +
            "\n");
        LogResult(stats, "Wounded avg: " + (stats.totalWounded / stats.bloodWars).toFixed(1) +
            ",  max " + stats.maxWounded + " of " + maxSoldiers +
            "\n");
        LogResult(stats, "Pity avg:    " + (stats.totalPity / stats.bloodWars).toFixed(0) +
            ",  max: " + stats.maxPity +
            ", avg per gem: " + (stats.totalPityPerGem / stats.patrolGems).toFixed(0) +
            "\n");
        LogResult(stats, "Demon kills per hour: " +
            (stats.kills / hours).toFixed(0) +
            "\n");
        LogResult(stats, "Soul Forge on-time: " + ((stats.forgeOn / stats.bloodWars) * 100).toFixed(1) + "%" +
            ", souls per hour: " + (stats.forgeSouls / hours).toFixed(0) +
            "\n");
    }

    $('#result')[0].scrollIntoView(true);
    $('#result')[0].value = stats.outputStr;
    $('#result').scrollTop($('#result')[0].scrollHeight);

    /* Restore the Simulate button after locking it briefly, to avoid accidentally
       starting a new sim if the user attempts to press stop just as it finishes */
    $('#simButton').text("Simulate");
    $('#simButton').attr("disabled", true);
    setTimeout(function() {
        $('#paramsForm').unbind("submit");
        $('#paramsForm').submit(function(event) {
            event.preventDefault();
            Simulate();
        });
        $('#simButton').attr("disabled", false);
    }, 250);
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
    
    stats.totalPity += sim.pity;
    stats.maxPity = Math.max(stats.maxPity, sim.pity);
    
    LogVerbose(sim, params,
        "T " + sim.tick + 
        " ; soldiers " + sim.soldiers +
        " ; hellSoldiers " + sim.hellSoldiers +
        " ; threat " + sim.threat);

    /* Check whether enough soldiers are currently available to keep the soul forge running */
    let forgeOperating = false;
    if (params.soulForge >= 1) {
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let forgeSoldiers = ForgeSoldiers(params);
        if (defenders >= forgeSoldiers) {
            forgeOperating = true;
            stats.forgeOn++;
        }
    }
    let forgeSouls = 0;

    /* Drone Strikes */
    for (let i = 0; i < params.predators; i++) {
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            let kills = params.advDrones ? Rand(50, 125) : Rand(25, 75);
            if (kills < demons) {
                sim.threat -= kills;
                if (forgeOperating) {
                    forgeSouls += kills;
                }
                stats.kills += kills;
            } else {
                sim.threat -= demons;
                if (forgeOperating) {
                    forgeSouls += demons;
                }
                stats.kills += demons;
            }
        }
    }
    
    /* Gem Chance */
    let gemOdds = params.technophobe ? 9000 : 10000;
    gemOdds -= sim.pity;
    if (params.darkEnergy >= 1) {
        gemOdds -= Math.round(Math.log2(params.darkEnergy) * 2);
    }
    for (let i = 0; i < params.beacons; i++) {
        gemOdds = Math.round(gemOdds * 0.92);
    }
    if (params.ghostly) {
        gemOdds = Math.round(gemOdds * 0.85);
    }
    
    /* Patrols */
    let soldiersKilled = 0;
    let needPity = false;
    let patrolWounds = 0;
    let extraWounds = 0;
    if (sim.wounded > 0) {
        /* Figure out how many wounds to assign to patrols */
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let garrison = sim.soldiers - sim.hellSoldiers;
        let patrolWoundTotal = sim.wounded - garrison - defenders;
        if (patrolWoundTotal > 0) {
            patrolWounds = Math.floor(patrolWoundTotal / sim.patrols);
            extraWounds = patrolWoundTotal % sim.patrols;
        }
    }
    for (let i = 0; i < sim.patrols; i++) {
        /* Check for encounter
           Less demons -> lower chance of encounter
         */
        let wounded = patrolWounds;
        if (i < extraWounds) {
            wounded++;
        }
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            /* Encounter */
            stats.patrolEncounters++;
            
            let patrolSize = params.patrolSize;
            /* Add droids if available */
            if (i < params.droids) {
                patrolSize += params.enhDroids ? 2 : 1;
            }
            
            let patrolRating = ArmyRating(params, sim, patrolSize, wounded);

            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            
            let ambushOdds = (params.chameleon || params.elusive) ? 50 : 30;
            if (Rand(0, ambushOdds) == 0) {
                /* Ambush 
                   Patrol armor is ignored, at least one will be killed/injured, and no chance for a soul gem
                 */
                stats.ambushes++;

                soldiersKilled += PatrolCasualties(params, sim, stats, demons, true);
                let demonsKilled = Math.round(patrolRating / 2);
                if (demonsKilled < demons) {
                    sim.threat -= demonsKilled;
                    if (forgeOperating) {
                        forgeSouls += demonsKilled;
                    }
                    stats.kills += demonsKilled;
                } else {
                    sim.threat -= demons;
                    if (forgeOperating) {
                        forgeSouls += demons;
                    }
                    stats.kills += demons;
                }
            } else {
                /* Normal encounter */
                let demonsKilled = patrolRating;
                if (demonsKilled < demons) {
                    /* Suffer casualties if the patrol didn't kill all of the demons */
                    soldiersKilled += PatrolCasualties(params, sim, stats, (demons - demonsKilled), false);
                    sim.threat -= demonsKilled;
                    if (forgeOperating) {
                        forgeSouls += demonsKilled;
                    }
                    stats.kills += demonsKilled;
                } else {
                    sim.threat -= demons;
                    if (forgeOperating) {
                        forgeSouls += demons;
                    }
                    stats.kills += demons;
                }
                
                /* Chance to find a soul gem */
                if (Rand(0, gemOdds) == 0) {
                    stats.patrolGems++;
                    stats.totalPityPerGem += sim.pity;
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
    
    if (params.revive) {
        let reviveMax = soldiersKilled / 3 + 0.25;
        let revived = Math.round(Math.random() * reviveMax);
        sim.soldiers += revived;
        stats.soldiersRevived += revived;
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
        if (params.printLostPatrols) {
            LogResult(stats, TimeStr(sim) + " - Lost patrol. " + sim.patrols + " remaining.  Threat: " + sim.threat + "\n");
        }
        if (sim.patrols == 0) {
            LogResult(stats, "!!! Lost all patrols at " + TimeStr(sim) + " !!!\n\n");
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
        if (sim.siegeOdds <= 900 && Rand(0, sim.siegeOdds) == 0) {
            stats.sieges++;
            let demons = Math.round(sim.threat / 2);
            let defense = FortressRating(params, sim);
     
            if (params.printSieges) {
                LogResult(stats, TimeStr(sim) + " - " +
                    "Siege -- Demons " + demons +
                    ",  Fortress rating " + defense);
            }

            defense = Math.max(1, defense / 35);

            let totalKills = 0;
            while (demons > 0 && sim.walls > 0) {
                let kills = Math.round(Rand(1, defense+1));
                totalKills += Math.min(kills, demons);
                demons -= Math.min(kills, demons);
                sim.threat -= Math.min(kills, sim.threat);
                if (demons > 0) {
                    sim.walls--;
                    if (sim.walls == 0) {
                        break;
                    }
                }
            }
            if (forgeOperating) {
                forgeSouls += totalKills;
            }
            stats.kills += totalKills;
            if (params.printSieges) {
                LogResult(stats, ",  Walls " + sim.walls + "\n");
            }
            
            if (sim.walls == 0) {
                sim.soldiers -= sim.patrols * params.patrolSize;
                sim.soldiers -= sim.hellSoldiers;
                sim.patrols = 0;
                sim.hellSoldiers = 0;
                sim.maxHellSoldiers = 0;
                LogResult(stats, "!!! Walls fell at " + TimeStr(sim) + " !!!\n\n");
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
        let divisor = 1000;
        if (params.governor == "sports") {
            divisor *= 1.10;
        }
        if (params.blurry) {
            divisor += 250;
        }
        if (params.shieldGen) {
            divisor += 250;
        }
        let danger = sim.threat / divisor;
        let exposure = Math.min(10, sim.surveyors);
        let risk = 10 - Rand(0, exposure+1);
        
        if (danger > risk) {
            let cap = Math.round(danger);
            let dead = Rand(0, cap+1);
            sim.surveyors -= Math.min(dead, sim.surveyors);
        }
    }

    /* Soul Attractors */
    if (forgeOperating) {
        forgeSouls += params.soulAttractors * ((params.soulTrap * 5) + Rand(40, 120));
    }

    /* Gun Emplacements */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 6750 : 7500;
        if (params.soulLink) {
            gemOdds = Math.round(gemOdds * 0.94 ** params.soulAttractors);
        }
        let gunKills = 0;
        if (params.advGuns) {
            gunKills = params.guns * Rand(35, 75);
        } else {
            gunKills = params.guns * Rand(20, 40);
        }
        forgeSouls += gunKills;
        stats.kills += gunKills;
        for (let i = 0; i < params.guns; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gunGems++;
            }
        }
    }

    /* Gate Turrets */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 2700 : 3000;
        let gateKills = 0;
        if (params.advGuns) {
            gateKills = params.gateTurrets * Rand(65, 100);
        } else {
            gateKills = params.gateTurrets * Rand(40, 60);
        }
        forgeSouls += gateKills;
        stats.kills += gateKills;
        for (let i = 0; i < params.gateTurrets; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gateGems++;
            }
        }
    }
    
    /* Soul Forge */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 4500 : 5000;
        let forgeKills = Rand(25, 150);
        forgeSouls += forgeKills;
        stats.kills += forgeKills;
        if (Rand(0, gemOdds) == 0) {
            stats.forgeGems++;
        }
    
        stats.forgeSouls += forgeSouls;
        sim.forgeSouls += forgeSouls;
        
        let cap = params.soulAbsorption ? 750000 : 1000000;
        if (params.soulLink) {
            cap = Math.round(cap * 0.97 ** params.soulAttractors);
        }
        if (sim.forgeSouls > cap) {
            stats.forgeGems++;
            sim.forgeSouls = 0;
        }
    }
}

function Events(params, sim, stats) {    
    if (Rand(0, sim.eventOdds) == 0) {
        let events = [
            "surge",
            "terrorist",
            "ruins",
            "inspiration"
        ];
        
        if (!params.kindling) {
            events.push("fire");
        }
        
        if (!(params.kindling || params.smoldering || params.evil || params.aquatic)) {
            events.push("fire");
        }
        if (params.slaver) {
            events.push("slave1", "slave2", "slave3");
        }
        
        /* Remove the last event that occurred from the list so that the same event can't happen twice in a row */
        let lastIdx = events.indexOf(sim.lastEvent);
        if (lastIdx != -1) {
            events.splice(lastIdx, 1);
        }

        let event = events[Rand(0, events.length)];
        
        if (event == "surge") {
            /* Demon surge event, if enabled by user */
            if (params.surges) {
                let surge = Rand(2500, 5000);
                sim.threat += surge;
                stats.surges++;
                if (params.printSurges) {
                    LogResult(stats, TimeStr(sim) + " - Demon Surge Event!  " + surge + " new demons, new threat total " + sim.threat + "\n");
                }
            }
        } else if (event == "terrorist") {
            /* Terrorist attack or enemy raid.  Equivalent for our purposes here */
            if (params.terrorists) {
                let killed = Rand(0, sim.wounded);
                let wounded = Rand(sim.wounded, sim.soldiers);
                
                sim.soldiers -= killed;
                stats.soldiersKilled += killed;
                sim.wounded += wounded;
                
                if (sim.wounded > sim.soldiers) {
                    sim.wounded = sim.soldiers;
                }
                if (params.printTerrorists) {
                    LogResult(stats, TimeStr(sim) + " - Terrorist attack: " + wounded + " wounded, " + killed + " killed.\n");
                }
            }
        } /* else, irrelevant event */
        
        sim.lastEvent = event;
        
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

function HireMercs(params, sim, stats) {
    
    switch (params.hireMercs) {
        case 0: return;
        case 1: /* Volch Script */
            while (MercScriptReqsMet(params, sim, stats) == true) {
                var price = MercPrice(sim, stats)
                sim.money -= price;
                sim.soldiers++;
                if (sim.hellSoldiers < sim.maxHellSoldiers) {
                    sim.hellSoldiers++;
                }
                stats.mercCosts += price;
                sim.mercCounter++;
                stats.mercsHired++;
            }
            break;
        case 2: /* Autoclick */
            sim.clickerCounter++;
            if ((sim.clickerCounter * stats.tickLength) / 1000 >= params.clickerInterval) {
                if (sim.soldiers < sim.maxSoldiers) {
                    var price = MercPrice(sim, stats);
                    if (price <= sim.money) {
                        sim.money -= price;
                        sim.soldiers++;
                        if (sim.hellSoldiers < sim.maxHellSoldiers) {
                            sim.hellSoldiers++;
                        }
                        stats.mercCosts += price;
                        sim.mercCounter++;
                        stats.mercsHired++;
                    }
                }
                sim.clickerCounter = 0;
            }
            break;
        default: break;
    }
    
    if (sim.money < stats.minMoney) {
        stats.minMoney = sim.money;
    }
}

function MercScriptReqsMet(params, sim, stats) {
    var price = MercPrice(sim, stats);  
    var moneyThreshold = params.moneyCap * (params.scriptCapThreshold / 100.0);
    var incomeThreshold = params.moneyIncome * params.scriptIncome;
    
    if (price > sim.money) {
        return false;
    }
    
    if (sim.soldiers >= sim.maxSoldiers) {
        return false;
    }
    
    if (sim.money > moneyThreshold) {
        return true;
    }
    
    if (price  <= incomeThreshold) {
        return true;
    }
}

function MercPrice(sim, stats) {
    var garrison = sim.soldiers - sim.hellSoldiers;
    var price = Math.round((1.24 ** garrison) * 75) - 50;
    if (price > 25000){
        price = 25000;
    }
    if (sim.mercCounter > 0){
        price *= 1.1 ** sim.mercCounter;
    }
    if (params.brute){
        price *= 0.5;
    }
    
    /* Convert to millions */
    price /= 1000000.0;
    
    if (price > stats.mercMaxPrice) {
        stats.mercMaxPrice = price;
    }
    
    return price;
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
    if (params.governor == "sports") {
        healCredits *= 1.5;
    }
    healCredits = Math.round(healCredits);
    
    let healCost = params.slowRegen ? 25 : 20;
    healed += Math.floor(healCredits / healCost);
    healCredits = healCredits % healCost;
    if (Rand(0, healCredits) > Rand(0, healCost)) {
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
    let repair = 180;
    if (params.repairDroids > 0) {
        repair *= 0.95 ** params.repairDroids;
        repair = Math.round(repair);
    }
    
    sim.carRepair++;
    if (sim.carRepair >= repair) {
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
    
    return dead;
}

/* Returns soldier training time in ticks, not rounded */
function TrainingTime(params) {
    var rate;
    var bootCampBonus;

    bootCampBonus = params.vrTraining == true ? 0.08 : 0.05;
    bootCampBonus += params.bloodLust * 0.002;
    if (params.governor == "soldier") {
        bootCampBonus *= 1.25;
    }
    
    /* rate is percentage points per tick */
    rate = params.diverse ? 2.0 : 2.5;
    rate *= 1 + params.bootCamps * bootCampBonus;
    if (params.beast) {
        rate *= 1.2;
    }
    if (params.brute) {
        rate += 2.5;
    }
    rate *= 0.25;
    
    /* Convert to ticks per soldier */
    rate /= 100.0;
    return 1.0/rate;
}

function ArmyRating(params, sim, size, wound) {
    var rating = size;
    var wounded = 0;
    
    if (wound) {
        wounded = wound;
    } else if (sim) {
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
        rating *= 1.25;
    }
    if (params.chameleon) {
        rating *= 1.2;
    }
    if (params.cautious) {
        if (sim) {
            /* Not doing a full weather sim here, but it rains about 21.6% of the time
               in most biomes */
            if (Rand(0, 1000) < 216) {
                rating *= 0.9;
            }
        } else {
            /* Approximate 0.9784 multiplier (1 * (1 - 0.216) + 0.9 * .216) */
            rating *= 0.9784;
        }
    }
    if (params.apexPredator) {
        rating *= 1.3;
    }
    if (params.fiery) {
        rating *= 1.65;
    }
    if (params.sticky) {
        rating *= 1.15;
    }
    if (params.pathetic) {
        rating *= 0.75;
    }
    if (params.holy) {
        rating *= 1.5;
    }
    if (params.rage) {
        rating *= 1.05;
    }
    if (params.magic) {
        rating *= 0.75;
    }
    if (params.banana) {
        rating *= 0.8;
    }
    if (params.governor == "soldier") {
        rating *= 1.05;
    }

    rating *= 1 + (params.tactical * 0.05);
    
    rating *= 1 + (params.temples * 0.01);
    
    rating *= 1 + (params.warRitual / (params.warRitual + 75));
    
    if (params.parasite) {
        if (size == 1) {
            rating += 2;
        } else if (size > 1) {
            rating += 4;
        }
    }
    
    if (params.government == "autocracy") {
        rating *= 1.35;
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
    
    if (params.government == "democracy") {
        rating *= 0.95;
    }
    
    return Math.round(rating);
}

function FortressRating(params, sim) {
    var turretRating;
    var patrols;
    var defenders;
    var wounded;
    
    if (sim) {
        patrols = sim.patrols;
        defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        if (params.soulForge >= 1) {
            let forgeSoldiers = ForgeSoldiers(params);
            if (defenders >= forgeSoldiers) {
                defenders -= forgeSoldiers;
            }
        }
        let garrison = sim.soldiers - sim.hellSoldiers;
        if (sim.wounded > garrison) {
            wounded = sim.wounded - garrison;
            if (wounded > defenders) {
                wounded = defenders;
            }
        } else {
            wounded = 0;
        }
    } else {
        patrols = params.patrols;
        defenders = params.defenders;
        wounded = 0;
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
    
    return ArmyRating(params, sim, defenders, wounded) + params.turrets * turretRating;
}

function ForgeSoldiers(params) {
    let soldiers = Math.round(650 / ArmyRating(params, false, 1));
    let gunValue = params.advGuns ? 2 : 1;
    
    soldiers = Math.max(0, soldiers - params.guns * gunValue);
    
    return soldiers;
}

function OnChange() {
    var params = GetParams();
    var patrolRating;
    var patrolRatingDroids;
    var fortressRating;
    var trainingTime;
    
    patrolRating = ArmyRating(params, false, params.patrolSize);
    if (params.enhDroids) {
        patrolRatingDroids = ArmyRating(params, false, params.patrolSize + 2);
    } else {
        patrolRatingDroids = ArmyRating(params, false, params.patrolSize + 1);
    }
    
    ratingStr = "";
    if (params.cautious) {
        ratingStr += "~ ";
    }    
    if (params.patrols == 0) {
        ratingStr += patrolRating;
    } else if (params.droids >= params.patrols) {
        ratingStr += patrolRatingDroids;
    } else if (params.droids > 0) {
        ratingStr += patrolRating + " / " + patrolRatingDroids;
    } else {
        ratingStr += patrolRating;
    }
    $('#patrolRating').html(ratingStr);
    
    
    fortressRating = FortressRating(params, false);
    if (params.cautious) {
        ratingStr = "~ " + fortressRating;
    } else {
        ratingStr = fortressRating;
    }
    $('#fortressRating').html(ratingStr);
    
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

    if (params.hireMercs == 1) {
        $('#moneyIncomeDiv')[0].hidden = false;
        $('#moneyCapDiv')[0].hidden = false;
        $('#scriptCapThresholdDiv')[0].hidden = false;
        $('#scriptIncomeDiv')[0].hidden = false;
        $('#clickerIntervalDiv')[0].hidden = true;
        $('#mercsBlank1')[0].hidden = true;
        $('#mercsBlank2')[0].hidden = true;
        $('#mercsBlank3')[0].hidden = true;
        $('#mercsBlank4')[0].hidden = true;
        $('#mercsBlank5')[0].hidden = false;
        var mercRate = 240;
        if (params.hyper) {
            mercRate /= 0.95;
        }
        if (params.slow) {
            mercRate /= 1.1;
        }
        trainingRate += mercRate;
        trainingTime = 3600 / trainingRate;

    } else if (params.hireMercs == 2) {
        $('#moneyIncomeDiv')[0].hidden = false;
        $('#moneyCapDiv')[0].hidden = false;
        $('#scriptCapThresholdDiv')[0].hidden = true;
        $('#scriptIncomeDiv')[0].hidden = true;
        $('#clickerIntervalDiv')[0].hidden = false;
        $('#mercsBlank1')[0].hidden = true;
        $('#mercsBlank2')[0].hidden = true;
        $('#mercsBlank3')[0].hidden = true;
        $('#mercsBlank4')[0].hidden = false;
        $('#mercsBlank5')[0].hidden = false;
        var mercRate;
        if (params.clickerInterval > 15) {
            mercRate = (3600 / params.clickerInterval);
        } else {
            mercRate = 240;
        }
        if (params.hyper) {
            mercRate /= 0.95;
        }
        if (params.slow) {
            mercRate /= 1.1;
        }
        trainingRate += mercRate;
        trainingTime = 3600 / trainingRate;

    } else {
        $('#moneyIncomeDiv')[0].hidden = true;
        $('#moneyCapDiv')[0].hidden = true;
        $('#scriptCapThresholdDiv')[0].hidden = true;
        $('#scriptIncomeDiv')[0].hidden = true;
        $('#clickerIntervalDiv')[0].hidden = true;
        $('#mercsBlank1')[0].hidden = false;
        $('#mercsBlank2')[0].hidden = false;
        $('#mercsBlank3')[0].hidden = false;
        $('#mercsBlank4')[0].hidden = false;
        $('#mercsBlank5')[0].hidden = false;
    } 

    $('#trainingRate').html(trainingTime.toFixed(2) + "sec&nbsp;&nbsp;&nbsp;" + trainingRate.toFixed(1) + "/hour");
    

    let forgeSoldiers = ForgeSoldiers(params);
    if (params.soulForge == 2) {
        $('#forgeSoldiers').html(forgeSoldiers + " / " + forgeSoldiers + " soldiers");
    } else {
        $('#forgeSoldiers').html("0 / " + forgeSoldiers + " soldiers");
    }
    
    /* Round dark energy to 3 places */
    $('#darkEnergy')[0].value = params.darkEnergy = +params.darkEnergy.toFixed(3);
    
    /* Save params to localStorage */
    window.localStorage.setItem('hellSimParams', JSON.stringify(params));
}

function LogResult(stats, str) {
    if (stats) {
        stats.outputStr += str;
    } else {
        let result = $('#result');
        result[0].value += str;
        result.scrollTop(result[0].scrollHeight);
    }
}

function LogVerbose(stats, params, str) {
    if (!params.verbose) return;
    LogResult(stats, str);
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

    $('.hell-sim-param').each(function(index, element) {
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
        } else if (!isNaN(el.val())) {
            params[id] = Number(el.val());
        } else {
            params[id] = el.val();
        }
    });
    
    return params;
}

/* Fill parameter values back to the form */
function SetParams(params) {
    console.log(params);
    for (const key of Object.keys(params)) {
        let id = "#" + key;
        let el = $(id);
        if (el.length && params[key]) {
            if (el.attr('type') == "checkbox") {
                el[0].checked = params[key];
            } else {
                el.val(params[key].toString());
            }
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
    $('#banana')[0].checked = save.race['banana'] ? true : false;
    $('#beast')[0].checked = save.race['beast'] ? true : false;
    $('#blurry')[0].checked = save.race['blurry'] ? true : false;
    $('#brute')[0].checked = save.race['brute'] ? true : false;
    $('#cannibal')[0].checked = save.race['cannibalize'] ? true : false;
    $('#cautious')[0].checked = save.race['cautious'] ? true : false;
    $('#chameleon')[0].checked = save.race['chameleon'] ? true : false;
    $('#claws')[0].checked = save.race['claws'] ? true : false;
    $('#diverse')[0].checked = save.race['diverse'] ? true : false;
    $('#elusive')[0].checked = save.race['elusive'] ? true : false;
    $('#evil')[0].checked = save.race['evil'] ? true : false;
    $('#fiery')[0].checked = save.race['fiery'] ? true : false;
    $('#ghostly')[0].checked = save.race['ghostly'] ? true : false;
    $('#hivemind')[0].checked = save.race['hivemind'] ? true : false;
    $('#holy')[0].checked = save.race['holy'] ? true : false;
    $('#hyper')[0].checked = save.race['hyper'] ? true : false;
    $('#kindling')[0].checked = save.race['kindling_kindred'] ? true : false;
    $('#magic')[0].checked = save.race.universe == 'magic' ? true : false;
    $('#parasite')[0].checked = save.race['parasite'] ? true : false;
    $('#pathetic')[0].checked = save.race['pathetic'] ? true : false;
    $('#puny')[0].checked = save.race['puny'] ? true : false;
    $('#rage')[0].checked = save.city.ptrait == 'rage' ? true : false;
    $('#regenerative')[0].checked = save.race['regenerative'] ? true : false;
    $('#revive')[0].checked = save.race['revive'] ? true : false;
    $('#scales')[0].checked = save.race['scales'] ? true : false;
    $('#slaver')[0].checked = save.race['slaver'] ? true : false;
    $('#slow')[0].checked = save.race['slow'] ? true : false;
    $('#slowRegen')[0].checked = save.race['slow_regen'] ? true : false;
    $('#smoldering')[0].checked = save.race['smoldering'] ? true : false;
    $('#sticky')[0].checked = save.race['sticky'] ? true : false;
    $('#technophobe')[0].checked = save.stats.achieve['technophobe'] && save.stats.achieve.technophobe.l >= 5 ? true : false;
    
    $('#zealotry')[0].checked = save.tech['fanaticism'] && save.tech['fanaticism'] >= 4 ? true : false;
    $('#vrTraining')[0].checked = save.tech['boot_camp'] && save.tech['boot_camp'] >= 2 ? true : false;
    $('#bacTanks')[0].checked = save.tech['medic'] && save.tech['medic'] >= 2 ? true : false;
    $('#shieldGen')[0].checked = save.tech['infernite'] && save.tech['infernite'] >= 5 ? true : false;
    $('#advDrones')[0].checked = save.tech['portal'] && save.tech['portal'] >= 7 ? true : false;
    $('#enhDroids')[0].checked = save.tech['hdroid'] && save.tech['hdroid'] >= 1 ? true : false;
    $('#soulAbsorption')[0].checked = save.tech['hell_pit'] && save.tech['hell_pit'] >= 6 ? true : false;
    $('#soulLink')[0].checked = save.tech['hell_pit'] && save.tech['hell_pit'] >= 7 ? true : false;
    $('#advGuns')[0].checked = save.tech['hell_gun'] && save.tech['hell_gun'] >= 2 ? true : false;

    $('#weaponTech')[0].value = save.tech['military'] ? (save.tech['military'] >= 5 ? save.tech['military'] - 1 : save.tech['military']) : 0;
    $('#armorTech')[0].value = save.tech['armor'] || 0;
    $('#turretTech')[0].value = save.tech['turret'] || 0;
    $('#tactical')[0].value = save.race['tactical'] || 0;
    $('#temples')[0].value = save.city.temple ? save.city.temple.count : 0;
    $('#government')[0].value = save.civic.govern.type || 'anarchy';
    $('#governor')[0].value = save.race['governor'] && save.race.governor['g'] ? save.race.governor.g.bg : 'none';
    $('#bootCamps')[0].value = save.city.boot_camp ? save.city.boot_camp.count : 0;
    $('#hospitals')[0].value = save.city.hospital ? save.city.hospital.count : 0;
    $('#fibroblast')[0].value = save.race['fibroblast'] || 0;
    let dark = save.race.Dark.count;
    dark *= 1 + (save.race.Harmony.count * 0.01);
    $('#darkEnergy')[0].value = save.race.universe == 'evil' ? dark.toFixed(3) : 0;
    $('#warRitual')[0].value = save.race['casting'] ? save.race.casting.army : 0;
    $('#bloodLust')[0].value = save['blood'] && save.blood['lust'] ? save.blood.lust : 0;
    $('#soulTrap')[0].value = save['blood'] && save.blood['attract'] ? save.blood.attract : 0;

    $('#moneyCap')[0].value = save.resource['Money'] ? (save.resource.Money.max / 1000000).toFixed(2) : 0;
    $('#moneyIncome')[0].value = save.resource['Money'] ? (save.resource.Money.diff / 1000000).toFixed(2) : 0;
    
    if (save.portal && save.portal.fortress) {
        let patrols = save.portal.fortress.patrols;
        let patrolSize = save.portal.fortress.patrol_size;
        var defenders;
        var garrison;
        if (save.portal.fortress.assigned) {
            defenders = save.portal.fortress.assigned - (patrols * patrolSize);
            if (save.portal['guard_post']) {
                defenders -= save.portal.guard_post.on;
            }
            garrison = save.civic.garrison.max - save.civic.garrison.crew - save.portal.fortress.assigned;
        } else {
            defenders = 0;
            garrison = save.civic.garrison.max;
        }
        $('#patrols')[0].value = patrols;
        $('#patrolSize')[0].value = patrolSize;
        $('#defenders')[0].value = defenders;
        $('#garrison')[0].value = garrison;
        $('#surveyors')[0].value = save.portal.carport ? save.portal.carport.count : 0;
        $('#repairDroids')[0].value = save.portal.repair_droid ? save.portal.repair_droid.count : 0;
        $('#turrets')[0].value = save.portal.turret ? save.portal.turret.on : 0;
        $('#beacons')[0].value = save.portal.attractor ? save.portal.attractor.on : 0;
        $('#predators')[0].value = save.portal.war_drone ? save.portal.war_drone.on : 0;
        $('#droids')[0].value = save.portal.war_droid ? save.portal.war_droid.on : 0;
        $('#guns')[0].value = save.portal.gun_emplacement ? save.portal.gun_emplacement.on : 0;
        $('#soulAttractors')[0].value = save.portal.soul_attractor ? save.portal.soul_attractor.on : 0;
        $('#gateTurrets')[0].value = save.portal.gate_turret ? save.portal.gate_turret.on : 0;
        $('#soulForge')[0].value = 0; /* Update later */
    } else {
        $('#patrols')[0].value = 0;
        $('#patrolSize')[0].value = 0;
        $('#defenders')[0].value = 0;
        $('#garrison')[0].value = 0;
        $('#surveyors')[0].value = 0;
        $('#repairDroids')[0].value = 0;
        $('#turrets')[0].value = 0;
        $('#beacons')[0].value = 0;
        $('#predators')[0].value = 0;
        $('#droids')[0].value = 0;
        $('#guns')[0].value = 0;
        $('#soulAttractors')[0].value = 0;
        $('#gateTurrets')[0].value = 0;
        $('#soulForge')[0].value = 0;
    }

    /* Update for Soul Forge */
    let params = GetParams();
    if (save.portal && save.portal.fortress && save.portal.soul_forge && save.portal.soul_forge.on >= 1) {
        let forgeSoldiers = ForgeSoldiers(params);
        if (params.defenders >= forgeSoldiers) {
            $('#soulForge')[0].value = 2;
            $('#defenders')[0].value -= forgeSoldiers;
        } else {
            $('#soulForge')[0].value = 1;
        }
    }

    OnChange();
    
}

$(document).ready(function() {
    console.log("Ready");
    $('#result').val("Ready\n");
    
    $('#paramsForm').submit(function(event) {
        event.preventDefault();
        Simulate();
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

