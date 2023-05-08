var gStop = false;

/*
    Every message has a 'cmd' field to specify the message type.  For each cmd, there may be other fields

    Messages FROM main TO worker:
        'info'                  - Request info for updating the UI for army rating, training rate, etc.
            params                  - Sim parameters
        'start'                 - Start a simulation
            id                      - Worker index ID
            simId                   - Sim number
            params                  - Sim parameters
            stats                   - Pre-initialized statistics
        'stop'                  - Stop the simulation
        
    Messages FROM worker TO main:
        'info'                  - Response to info request
            fortressRating          - Fortress combat rating
            patrolRating            - Normal patrol combat rating
            patrolRatingDroids      - Droid-augmented patrol combat rating
            trainingTime            - Soldier training time in ticks per soldier
            forgeSoldiers           - Number of soldiers required to run the Soul Forge
        'progress'              - Update for progress bar
            increment               - Progress increment as a percentage of the sim
        'done'                  - Simulation finished
            id                      - Worker index ID
            stats                   - Result stats
        'stopped'               - Simulation stopped after a stop request
            stats                   - Partial result stats
*/
onmessage = function(e) {
    switch (e.data.cmd) {
        case 'info':
            ProvideInfo(e.data.params);
            break;
        case 'start':
            SimStart(e.data.id, e.data.simId, e.data.params, e.data.stats);
            break;
        case 'stop':
            gStop = true;
            break;
        default:
            break;
    }
    
    return;
}

function SimStart(id, simId, params, stats) {
    var tickLength = 250;
    if (params.hyper) {
        tickLength *= TraitSelect(params.hyper, 0.98, 0.97, 0.95, 0.94, 0.93);
    }
    if (params.slow) {
        tickLength *= TraitSelect(params.slow, 1.13, 1.12, 1.1, 1.08, 1.06);
    }
    var sim = {
        id: id,
        simId: simId,
        tick: 0,
        ticks: Math.round(params.hours * 3600 * 1000 / tickLength),
        tickLength: tickLength,
        threat: params.threat,
        patrols: params.patrols,
        soldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        maxSoldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        hellSoldiers: params.patrols * params.patrolSize + params.defenders,
        maxHellSoldiers: params.patrols * params.patrolSize + params.defenders,
        patrolRating: 0,
        patrolRatingDroids: 0,
        wounded: 0,
        trainingProgress: 0,
        trainingTime: 0,
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
        progress: 0,
        done: false
    };
    if (params.soulForge == 2) {
        let forgeSoldiers = ForgeSoldiers(params);
        sim.soldiers += forgeSoldiers;
        sim.maxSoldiers += forgeSoldiers;
        sim.hellSoldiers += forgeSoldiers;
        sim.maxHellSoldiers += forgeSoldiers;
    }
    /* Calculate patrol rating and training rate ahead of time for efficiency */
    sim.patrolRating = ArmyRating(params, false, params.patrolSize);
    sim.patrolRatingDroids = ArmyRating(params, false, params.patrolSize + DroidSize(params));
    sim.trainingTime = TrainingTime(params);

    LogResult(stats, " -- Sim " + sim.simId.toString().padStart(Math.floor(Math.log10(params.sims)) + 1, 0) + " --\n");

    gStop = false;

    SimScheduler(params, sim, stats);
}

function SimScheduler(params, sim, stats) {
    if (gStop) {
        SimCancel(sim, params, stats);
    } else {
        setTimeout(function() {
            SimRun(sim, params, stats);
        }, 0);
    }
}

function ProvideInfo (params) {
    var fortressRating;
    var patrolRating;
    var patrolRatingDroids;
    var trainingTime;
    var forgeSoldiers;
    
    fortressRating = FortressRating(params, false);
    patrolRating = ArmyRating(params, false, params.patrolSize);
    patrolRatingDroids = ArmyRating(params, false, params.patrolSize + DroidSize(params));
    trainingTime = TrainingTime(params);
    forgeSoldiers = ForgeSoldiers(params);

    self.postMessage({
        cmd: 'info',
        fortressRating: fortressRating,
        patrolRating: patrolRating,
        patrolRatingDroids: patrolRatingDroids,
        trainingTime: trainingTime,
        forgeSoldiers: forgeSoldiers
    });
}



function SimRun(sim, params, stats) {
    const ticks_per_bloodwar = 20;
    var startTime = Date.now();
    var newProgress;
    var progressIncrement;
    
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
            
            if (params.hireMercs == "governor") {
                HireMercs(params, sim, stats);
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
        sim.money += params.moneyIncome * (sim.tickLength / 1000);
        if (sim.money > params.moneyCap) {
            sim.money = params.moneyCap;
        }
        if (params.hireMercs == "script" || params.hireMercs == "autoclick") {
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
        
        if (sim.tick % ticks_per_bloodwar == 0) {
            newProgress = Math.floor(100 * sim.tick / sim.ticks);
            progressIncrement = newProgress - sim.progress;
            if (progressIncrement >= 1 || newProgress == 100) {
                self.postMessage({
                    cmd: 'progress',
                    increment: progressIncrement
                });
                sim.progress = newProgress;
            }
            /* Only check the time occasionally.  Checking on every tick is bad for performance */
            let msElapsed = Date.now() - startTime;
            if (msElapsed > 50) {
                /* Yield CPU */
                SimScheduler(params, sim, stats);
                return;
            }
        }
        
        if (gStop) {
            SimCancel(sim, params, stats);
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
    
    /* Report any remaining unreported progress.  Every finished sim should report 100% even if
       it fails early. */
    if (sim.progress < 100) {
        progressIncrement = 100 - sim.progress;
        self.postMessage({
            cmd: 'progress',
            increment: progressIncrement
        });
    }
    
    stats.totalPatrolsSurvived += sim.patrols;
    stats.minPatrolsSurvived = Math.min(sim.patrols, stats.minPatrolsSurvived);
    stats.maxPatrolsSurvived = Math.max(sim.patrols, stats.maxPatrolsSurvived);
    
    sim.done = true;
    
    /* Report finished results */
    self.postMessage({
        cmd: 'done',
        id: sim.id,
        stats: stats
    });
}

function SimCancel(sim, params, stats) {
    self.postMessage({
        cmd: 'stopped',
        stats: stats
    });
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
    let droneKills = 0;
    for (let i = 0; i < params.predators; i++) {
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            let kills = params.advDrones ? Rand(50, 125) : Rand(25, 75);
            if (kills > demons) {
                kills = demons;
            }
            sim.threat -= kills;
            if (forgeOperating) {
                forgeSouls += kills;
            }
            stats.kills += kills;
            stats.droneKills += kills;
            droneKills += kills;
        }
    }
    
    /* Gem Chance */
    let gemOdds = params.technophobe ? 9000 : 10000;
    gemOdds -= sim.pity;
    if (params.darkEnergy >= 1) {
        gemOdds -= Math.round(Math.log2(params.darkEnergy) * 2);
    }
    gemOdds = Math.round(gemOdds * (0.948 ** params.beacons));
    if (params.ghostly) {
        gemOdds = Math.round(gemOdds * TraitSelect(params.ghostly, 0.95, 0.9, 0.85, 0.8, 0.78));
    }
    
    /* Patrols */
    let soldiersKilled = 0;
    let needPity = true;
    /* Update patrol rating if cautious, for random weather */
    if (params.cautious) {
        sim.patrolRating = ArmyRating(params, sim, params.patrolSize);
        sim.patrolRatingDroids = ArmyRating(params, sim, params.patrolSize + DroidSize(params));
    }
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
    let droids = params.droids;
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
            
            var patrolRating;
            /* If no wounded, use alread-calculated patrol rating to save time */
            if (wounded == 0) {
                if (droids > 0) {
                    patrolRating = sim.patrolRatingDroids;
                    droids--;
                } else {
                    patrolRating = sim.patrolRating;
                }
            } else {
                let patrolSize = params.patrolSize;
                if (droids > 0) {
                    patrolSize += DroidSize(params);
                    droids--;
                }
                patrolRating = ArmyRating(params, sim, patrolSize, wounded);
            }
            
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            
            let ambushOdds = 30 + Math.max(params.elusive ? TraitSelect(params.elusive, 10, 15, 20, 25, 30) : 0, params.chameleon ? TraitSelect(params.chameleon, 10, 15, 20, 25, 30) : 0);
            
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
                let kills = patrolRating;
                if (kills < demons) {
                    /* Suffer casualties if the patrol didn't kill all of the demons */
                    soldiersKilled += PatrolCasualties(params, sim, stats, (demons - kills), false);
                } else {
                    kills = demons;
                }
                sim.threat -= kills;
                if (forgeOperating) {
                    forgeSouls += kills;
                }
                stats.patrolKills += kills;
                stats.kills += kills;
                
                /* Chance to find a soul gem */
                if (kills > 0) {
                    let chances = Math.round(kills / Math.max(5, 35 - Math.floor(params.beacons / 3)));
                    for (let j = 0; j < chances; j++) {
                        if (Rand(0, gemOdds) == 0) {
                            stats.patrolGems++;
                            stats.totalPityPerGem += sim.pity;
                            sim.pity = 0;
                            needPity = false;
                        }
                    }
                }
            }
        } else {
            /* Skipped encounter */
            stats.skippedEncounters++;
        }
    }
    
    if (params.revive) {
        let reviveDivisor = TraitSelect(params.revive, 4, 4, 3, 2, 2);
        let reviveMax = soldiersKilled / reviveDivisor + 0.25;
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

    LogVerbose(sim, params,
        " ; postThreat " + sim.threat +
        " ; dead " + soldiersKilled +
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
            divisor *= TraitSelect(params.blurry, 1.10, 1.15, 1.25, 1.35, 1.4);
        }
        if (params.instincts) {
            divisor *= TraitSelect(params.instincts, 1.03, 1.05, 1.10, 1.15, 1.2);
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
    
    if (sim.surveyors > 0 && droneKills > 0) {
        for (let i = 0; i < sim.surveyors; i++) {
            let searched = Math.min(100, Rand(Math.round(droneKills / sim.surveyors / 2), Math.round(droneKills / sim.surveyors)));
            let chances = Math.round(searched / Math.max(5, 25 - Math.floor(params.beacons / 5)));
            for (let j = 0; j < chances; j++) {
                if (Rand(0, gemOdds) == 0) {
                    stats.surveyorGems++;
                    stats.totalPityPerGem += sim.pity;
                    sim.pity = 0;
                    needPity = false;
                }
            }
        }
    }

    /* Pity */
    if (needPity && sim.pity < 10000) {
        sim.pity++;
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
    
    sim.trainingProgress += 100 / sim.trainingTime;
    
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
    var result;
    do {
        result = TryBuyMerc(params, sim, stats);
    } while (result == true);
    
    if (sim.money < stats.minMoney) {
        stats.minMoney = sim.money;
    }
    return;
}

function TryBuyMerc(params, sim, stats) {
    
    /* Filter out no-buy cases in stages to avoid calculating merc price every time */
    
    switch (params.hireMercs) {
        case "off":
            return false;
        case "governor": /* Governor task: Merc Recruitment */
        case "script": /* Volch Script */
            if (sim.soldiers + params.mercBuffer >= sim.maxSoldiers) {
                return false;
            }
            /* else proceed */
            break;
        case "autoclick": /* Autoclick */
            sim.clickerCounter++;
            if ((sim.clickerCounter * sim.tickLength) / 1000 < params.clickerInterval) {
                return false;
            } else {
                sim.clickerCounter = 0;
                if (sim.soldiers >= sim.maxSoldiers) {
                    return false;
                }
            }
            break;
        default: return false;
    }
    
    var price = MercPrice(params, sim, stats);
    if (price > sim.money) {
        return false;
    }
    
    switch (params.hireMercs) {
        case "governor":
            let reserve = params.moneyCap * (params.mercReserve / 100);
            if (sim.money + params.moneyIncome < reserve && price > params.moneyIncome)
            {
                return false;
            }
            break;
        case "script":
            var moneyThreshold = params.moneyCap * (params.scriptCapThreshold / 100.0);
            var incomeThreshold = params.moneyIncome * params.scriptIncome;
            
            if (sim.money > moneyThreshold || price <= incomeThreshold) {
                break;
            } else {
                return false;
            }
        default:
            return false;
    }
    
    /* Passed all checks.  Hire a merc */
    sim.money -= price;
    sim.soldiers++;
    if (sim.hellSoldiers < sim.maxHellSoldiers) {
        sim.hellSoldiers++;
    }
    stats.mercCosts += price;
    sim.mercCounter++;
    stats.mercsHired++;

    if (price > stats.maxMercPrice) {
        stats.maxMercPrice = price;
    }
    
    return true;
}
    
function MercPrice(params, sim, stats) {
    var garrison = sim.soldiers - sim.hellSoldiers;
    var price = Math.round((1.24 ** garrison) * 75) - 50;
    if (price > 25000){
        price = 25000;
    }
    if (sim.mercCounter > 0){
        price *= 1.1 ** sim.mercCounter;
    }
    if (params.brute){
        price *= TraitSelect(params.brute, 0.8, 0.75, 0.5, 0.4, 0.35);
    }
    if (params.highPop){
        price *= TraitSelect(params.highPop, 0.5, 0.34, 0.26, 0.212, 0.18);
    }
    
    /* Convert to millions */
    price /= 1000000.0;
    
    return price;
}

function HealSoldiers(params, sim, stats) {
    if (sim.wounded <= 0) {
        return;
    }

    var healed = 1;
    
    if (params.regenerative) {
        healed = TraitSelect(params.regenerative, 2, 3, 4, 5, 6);
    }
    
    var healCredits = params.hospitals;
    if (params.artifical) {
        healCredits = params.bootCamps;
    }
    if (params.bacTanks) {
        healCredits *= 2;
    }
    healCredits += params.fibroblast * 2;
    if (params.cannibal) {
        if (healCredits >= 20) {
            healCredits *= TraitSelect(params.cannibal, 1.08, 1.1, 1.15, 1.2, 1.22);
        } else {
            healCredits += Math.floor(TraitSelect(params.cannibal, 1.6, 2, 3, 4, 4.4));
        }
        healCredits += 3;
    }
    if (params.governor == "sports") {
        healCredits *= 1.5;
    }
    healCredits = Math.round(healCredits);
    
    var healCost = 20;
    if (params.slowRegen) {
        healCost *= TraitSelect(params.slowRegen, 1.4, 1.35, 1.25, 1.2, 1.15);
    }
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
            armor += TraitSelect(params.armored, 1, 1, 2, 2, 2);
        }
        if (params.scales) {
            armor += TraitSelect(params.scales, 1, 1, 1, 1, 2);
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
        if (params.instincts) {
            let proportion = TraitSelect(params.instincts, 0.15, 0.25, 0.5, 0.6, 0.65)
            let reduction = Math.floor(dead * proportion);
            dead -= reduction;
            wounded += reduction;
        }
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
    rate = 2.5;
    if (params.highPop) {
        rate *= TraitSelect(params.highPop, 1.5, 2.5, 3.5, 4.5, 5.5);
    }
    if (params.diverse) {
        rate /= TraitSelect(params.diverse, 1.35, 1.3, 1.25, 1.2, 1.15);
    }
    rate *= 1 + params.bootCamps * bootCampBonus;
    if (params.beast) {
        rate *= TraitSelect(params.beast, 1.04, 1.05, 1.1, 1.15, 1.2);
    }
    if (params.brute) {
        rate += TraitSelect(params.brute, 1.25, 1.5, 2.5, 3, 3.5);
    }
    rate *= 0.25;
    
    /* Convert to ticks per soldier */
    rate /= 100.0;
    return 1.0/rate;
}

function ArmyRating(params, sim, size, wound) {
    var rating = size;
    var wounded = 0;
    
    if (wound != undefined) {
        wounded = wound;
    } else if (sim) {
        if (size > sim.soldiers - sim.wounded) {
            wounded = size - (sim.soldiers - sim.wounded);
        }
    }
    
    if (params.rhinoRage) {
        rating += wounded * TraitSelect(params.rhinoRage, 0.2, 0.3, 0.5, 0.6, 0.65);
    } else {
        rating -= wounded / 2;
    }

    /* Game code subtracts 1 for tech >= 5 to skip bunk beds.  Here that gets skipped in the HTML selection values themselves */
    let weaponTech = params.weaponTech;

    if (weaponTech > 1 && params.sniper) {
        let sniperBonus = TraitSelect(params.sniper, 0.04, 0.06, 0.08, 0.09, 0.1)
        /* Sniper bonus doesn't apply to the base value of 1 or the Cyborg Soldiers upgrade */
        weaponTech -= params.weaponTech >= 10 ? 2 : 1;
        weaponTech *= 1 + (sniperBonus * weaponTech);
        weaponTech += params.weaponTech >= 10 ? 2 : 1;
    }
    
    rating *= weaponTech;
    
    if (sim && params.rhinoRage) {
        let rageBonus = TraitSelect(params.rhinoRage, 0.0025, 0.005, 0.01, 0.0125, 0.014);
        rating *= 1 + (rageBonus * sim.wounded);
    }
    if (params.puny) {
        rating *= TraitSelect(params.puny, 0.82, 0.85, 0.9, 0.94, 0.96);
    }
    if (params.claws) {
        rating *= TraitSelect(params.claws, 1.08, 1.12, 1.25, 1.32, 1.35);
    }
    if (params.chameleon) {
        rating *= TraitSelect(params.chameleon, 1.05, 1.1, 1.2, 1.25, 1.3);
    }
    if (params.cautious) {
        if (sim) {
            /* Not doing a full weather sim here, but it rains about 21.6% of the time
               in most biomes */
            if (Rand(0, 1000) < 216) {
                rating *= TraitSelect(params.cautious, 0.86, 0.88, 0.9, 0.92, 0.94);
            }
        } else {
            /* Average multiplier */
            rating *= (1 - 0.216) * 1 + 0.216 * TraitSelect(params.cautious, 0.86, 0.88, 0.9, 0.92, 0.94);
        }
    }

    if (params.apexPredator) {
        rating *= TraitSelect(params.apexPredator, 1.15, 1.2, 1.3, 1.4, 1.45);
    }
    if (params.fiery) {
        rating *= TraitSelect(params.fiery, 1.3, 1.4, 1.65, 1.7, 1.72);
    }
    if (params.sticky) {
        rating *= TraitSelect(params.sticky, 1.05, 1.08, 1.15, 1.18, 1.2);
    }
    if (params.pathetic) {
        rating *= TraitSelect(params.pathetic, 0.65, 0.7, 0.75, 0.8, 0.85);
    }
    if (params.holy) {
        rating *= TraitSelect(params.holy, 1.25, 1.3, 1.5, 1.6, 1.65);
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
    
    if (params.zealotry) {
        rating *= 1 + (params.temples * 0.01);
    }
    
    rating *= 1 + (params.warRitual / (params.warRitual + 75));
    
    if (params.parasite) {
        if (size == 1) {
            rating += 2;
        } else if (size > 1) {
            rating += 4;
        }
    }
    
    if (params.government == "autocracy") {
        if (params.governor == "bureaucrat") {
            rating *= 1.40;
        } else {
            rating *= 1.35;
        }
    }
    
    rating = Math.floor(rating);
    
    if (params.hivemind) {
        let breakpoint = TraitSelect(params.hivemind, 12, 11, 10, 8, 7);
        if (size <= 10) {
            rating *= (size * 0.05) + (1 - breakpoint * 0.05);
        } else {
            rating *= 1 + (1 - (0.99 ** (size - breakpoint)));
        }
    }
    
    if (params.cannibal) {
        rating *= TraitSelect(params.cannibal, 1.08, 1.1, 1.15, 1.2, 1.22);
    }
    
    if (params.ooze) {
        rating *= TraitSelect(params.ooze, 0.8, 0.85, 0.88, 0.9, 0.92);
    }
    
    if (params.government == "democracy") {
        rating *= 0.95;
    }
    
    if (params.highPop) {
        rating *= TraitSelect(params.highPop, 0.5, 0.34, 0.26, 0.212, 0.18);
    }
    
    return Math.round(rating);
}

function DroidSize(params) {
    var size = params.enhDroids ? 2 : 1;
    if (params.highPop) {
        size *= TraitSelect(params.highPop, 2, 3, 4, 5, 6);
    }
    return size;
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
        defenders += (params.droids - patrols) * DroidSize(params);
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

function TraitSelect(trait_rank, rank_quarter, rank_half, rank_1, rank_2, rank_3) {
    switch (trait_rank || 1) {
        case 0.25:
            return rank_quarter;
        case 0.5:
            return rank_half;
        case 1:
        default:
            return rank_1;
        case 2:
            return rank_2;
        case 3:
            return rank_3;
    }
}

function Rand(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function LogResult(stats, str) {
    stats.outputStr += str;
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


