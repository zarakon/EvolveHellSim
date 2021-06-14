var gStop = false;
var gSimWorkers = [];
var gParams = {};

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

    GetParams();
    
    var stats = {
        outputStr: "",
        startTime: 0,
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
    
    stats.startTime = Date.now();
    
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


function SimCancel(params, stats) {
    console.log("Canceled " + Date.now());
    LogResult(stats, "!!! Canceled !!!\n\n");
    SimResults(params, stats);
    gStop = false;
}

function SimResults(gParams, stats) {
    let ticksPerHour = stats.tickLength / 1000 / 3600;
    let hours = (stats.ticks * stats.tickLength / 1000) / 3600;
    let maxSoldiers = gParams.patrols * gParams.patrolSize + gParams.defenders + gParams.garrison;
    
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
    if (gParams.revive) {
        LogResult(stats,
            ", after revives: " + ((stats.soldiersKilled - stats.soldiersRevived) / hours).toFixed(1)); 
    }
    LogResult(stats,
            ",  per bloodwar: " + (stats.soldiersKilled / stats.bloodWars).toFixed(3) +
            ",  in ambushes: " + (stats.ambushDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
            "\n");
    if (gParams.hireMercs != "off") {
        LogResult(stats,
            "Mercs hired per hour: " + (stats.mercsHired / hours).toFixed(1) +
            ", avg cost: " + (stats.mercCosts / stats.mercsHired).toFixed(3) +
            ", max cost: " + stats.mercMaxPrice.toFixed(3) +
            ", min money " + stats.minMoney.toFixed(2) +
            "\n");
    }
    LogResult(stats, "Patrols survived (of " + gParams.patrols +
            ")  avg: " + (stats.totalPatrolsSurvived / stats.simsDone).toFixed(1) +
            ",  min: " + stats.minPatrolsSurvived +
            ",  max: " + stats.maxPatrolsSurvived +
            "\n");
    LogResult(stats, "Surveyors avg: " + (stats.totalSurveyors / stats.ticks).toFixed(1) +
            " (" + ((stats.totalSurveyors / stats.ticks) / gParams.surveyors * 100).toFixed(1) + "%)" +
            ",  min " + stats.minSurveyors + " of " + gParams.surveyors +
            "\n");
    LogResult(stats, "Hunting Garrison avg: " + (stats.totalGarrison / stats.ticks).toFixed(1) +
            " of " + gParams.garrison +
            " (" + ((stats.totalGarrison / stats.ticks) / gParams.garrison * 100).toFixed(1) + "%)" +
            "\n");
    LogResult(stats, "Walls avg: " + (stats.totalWalls / stats.bloodWars).toFixed(1) +
            ",  min " + stats.minWalls +
            "\n");
    
    if (gParams.extraResults) {
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
        LogResult(stats, "Total sim time: " + ((Date.now() - stats.startTime) / 1000).toFixed(1) + " seconds.  " +
            "Sim ticks per second: " + ((stats.ticks / ((Date.now() - stats.startTime) / 1000)) / 1000).toFixed(1) + "k" +
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


function SetupSimWorkers () {
    var workersRequired;
    var i;
    
    if (Number.isFinite(gParams.cpuThreads)) {
        workersRequired = gParams.cpuThreads;
    } else {
        workersRequired = 1;
    }
    
    if (workersRequired > gParams.sims) {
        workersRequired = gParams.sims;
    }

    i = 0;
    /* Add new workers if necessary */
    while (i < workersRequired) {
        if (i >= gSimWorkers.length) {
            gSimWorkers[i] = new Worker('./js/worker.js');
            gSimWorkers[i].onmessage = SimWorkerHandler;
        }
    
        i++;
    }
    /* If number of required workers has decreased, terminate excessive workers */
    while (i < gSimWorkers.length) {
        gSimWorkers[i].terminate();
        
        i++;
    }
    /* Remove terminated workers from array */
    if (gSimWorkers.length > workersRequired) {
        gSimWorkers.splice(workersRequired, (gSimWorkers.length - workersRequired));
    }
    
    console.log("Sim Workers: " + gSimWorkers.length);
}

/*
    Every message has a 'cmd' field to specify the message type.  For each cmd, there may be other fields

    Messages FROM main TO worker:
        'info'                  - Request info for updating the UI for army rating, training rate, etc.
            params                  - Sim parameters
        'start'                 - Start a simulation
            id                      - Unique sim ID number
            params                  - Sim parameters
        'stop'                  - Stop the simulation
        
    Messages FROM worker TO main:
        'info'                  - Response to info request
            fortressRating          - Fortress combat rating
            patrolRating            - Normal patrol combat rating
            patrolRatingDroids      - Droid-augmented patrol combat rating
            trainingTime            - Soldier training time in ticks per soldier
            forgeSoldiers           - Number of soldiers required to run the Soul Forge
        'progress'              - Update 
        'done'                  - Simulation finished
            id                      - Unique sim ID number
            stats                   - Result stats
        'stopped'               - Simulation stopped after a stop request
            id                      - Unique sim ID number
            stats                   - Partial result stats
*/


function SimWorkerHandler(e) {
    switch (e.data.cmd) {
        case 'info':
            UpdateUIStrings(e);
            break;

        case 'progress':
            break;

        case 'done':
            break;

        case 'stopped':
            break;

        default:
            break;
    }
}

/* Update strings in the UI based on info response from worker
    e.data {
        fortressRating          - Fortress combat rating
        patrolRating            - Normal patrol combat rating
        patrolRatingDroids      - Droid-augmented patrol combat rating
        trainingTime            - Soldier training time in ticks per soldier
        forgeSoldiers           - Number of soldiers required to run the Soul Forge
    }
*/
function UpdateUIStrings(e) {
    ratingStr = "";
    if (gParams.cautious) {
        ratingStr += "~ ";
    }    
    if (gParams.patrols == 0) {
        ratingStr += e.data.patrolRating;
    } else if (gParams.droids >= gParams.patrols) {
        ratingStr += e.data.patrolRatingDroids;
    } else if (gParams.droids > 0) {
        ratingStr += e.data.patrolRating + " / " + e.data.patrolRatingDroids;
    } else {
        ratingStr += e.data.patrolRating;
    }
    $('#patrolRating').html(ratingStr);
    
    
    if (gParams.cautious) {
        ratingStr = "~ " + e.data.fortressRating;
    } else {
        ratingStr = e.data.fortressRating;
    }
    $('#fortressRating').html(ratingStr);
    
    /* Get the training time, then round up to next tick and convert to seconds */
    trainingTime = e.data.trainingTime;
    trainingTime = Math.ceil(trainingTime) / 4;
    if (gParams.hyper) {
        trainingTime *= 0.95;
    }
    if (gParams.slow) {
        trainingTime *= 1.1;
    }
    let trainingRate = 3600 / trainingTime;
    let trainingStr = trainingTime.toFixed(2) + "sec&nbsp;&nbsp;&nbsp;" + trainingRate.toFixed(1);
    var mercRate;
    switch (gParams.hireMercs) {
        case 'script':
        case 'governor':
            mercRate = 240;
            if (gParams.hyper) {
                mercRate /= 0.95;
            }
            if (gParams.slow) {
                mercRate /= 1.1;
            }
            trainingStr += "+" + Math.round(mercRate);
            break;
        case 'autoclick':
            mercRate = 240;
            let optimalClickerInterval = 15;
            if (gParams.hyper) {
                optimalClickerInterval /= 0.95;
                mercRate /= 0.95;
            }
            if (gParams.slow) {
                optimalClickerInterval /= 1.1;
                mercRate /= 1.1;
            }
            if (gParams.clickerInterval > optimalClickerInterval) {
                mercRate = (3600 / gParams.clickerInterval);
            }
            trainingStr += "+" + Math.round(mercRate);
            break;
        default:
            break;
    }
    trainingStr += "/hour"
    $('#trainingRate').html(trainingStr);
    
    if (gParams.soulForge == 2) {
        $('#forgeSoldiers').html(e.data.forgeSoldiers + " / " + e.data.forgeSoldiers + " soldiers");
    } else {
        $('#forgeSoldiers').html("0 / " + e.data.forgeSoldiers + " soldiers");
    }
}

/* Duplicating these for now.  It's used in ConvertSave(), which I didn't account for when
   coming up with the info request solution for UI updates.  */
function ForgeSoldiers(params) {
    let soldiers = Math.round(650 / ArmyRating(params, false, 1));
    let gunValue = params.advGuns ? 2 : 1;
    
    soldiers = Math.max(0, soldiers - params.guns * gunValue);
    
    return soldiers;
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
        rating += wounded / 2;
    } else {
        rating -= wounded / 2;
    }

    /* Game code subtracts 1 for tech >= 5 to skip bunk beds.  Here that gets skipped in the HTML selection values themselves */
    let weaponTech = params.weaponTech;

    if (weaponTech > 1 && params.sniper) {
        /* Sniper bonus doesn't apply to the base value of 1 or the Cyborg Soldiers upgrade */
        weaponTech -= params.weaponTech >= 10 ? 2 : 1;
        weaponTech *= 1 + (0.08 * weaponTech);
        weaponTech += params.weaponTech >= 10 ? 2 : 1;
    }
    
    rating *= weaponTech;
    
    if (sim && params.rhinoRage) {
        rating *= 1 + (0.01 * sim.wounded);
    }
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


function OnChange() {
    var patrolRating;
    var patrolRatingDroids;
    var fortressRating;
    var trainingTime;
    
    GetParams();

    /* If cpuThreads is invalid, set it to default based on user hardware.
       This will always happen on first load because the default in the html file is -1 */
    if (!Number.isFinite(gParams.cpuThreads) || gParams.cpuThreads < 1) {
        if (Number.isFinite(navigator.hardwareConcurrency)) {
            gParams.cpuThreads = Math.floor(navigator.hardwareConcurrency * 0.8);
            if (gParams.cpuThreads < 1) {
                gParams.cpuThreads = 1;
            }
        } else {
            gParams.cpuThreads = 2;
        }
        $('#cpuThreads')[0].value = gParams.cpuThreads;
    }
    
    /* Set up or adjust the number of sim workers */
    SetupSimWorkers(gParams);

    /* Request info from a worker.  It will reply with Army rating, training rate, etc.
       This is mainly to avoid duplicating the code for calculating these things. */
    if (gSimWorkers[0]) {
        gSimWorkers[0].postMessage({cmd: 'info', params: gParams});
    }
    
    ShowMercOptions();
    
    /* Round dark energy to 3 places */
    $('#darkEnergy')[0].value = gParams.darkEnergy = +gParams.darkEnergy.toFixed(3);
    
    /* Manage collapsers */
    $('.collapser-icon').each(function(index, element) {
        var el = $(element);
        let content = $(el.parent().data("target"));
        if (el.text() == "+") {
            content.hide(100);
        } else {
            content.show(100);
        }
    });
    
    /* Save params to localStorage */
    window.localStorage.setItem('hellSimParams', JSON.stringify(gParams));
}

function ShowMercOptions() {
    switch (gParams.hireMercs) {
        case "script":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = false;
            $('#scriptIncomeDiv')[0].hidden = false;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = false;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = true;
            $('#mercsBlank5')[0].hidden = true;
            break;

        case "autoclick":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = false;
            $('#mercBufferDiv')[0].hidden = true;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = false;
            $('#mercsBlank5')[0].hidden = false;
            break;

        case "governor":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = false;
            $('#mercReserveDiv')[0].hidden = false;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = true;
            $('#mercsBlank5')[0].hidden = false;
            break;

        default:
            gParams.hireMercs = 'off';
            $('#moneyIncomeDiv')[0].hidden = true;
            $('#moneyCapDiv')[0].hidden = true;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = true;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = false;
            $('#mercsBlank2')[0].hidden = false;
            $('#mercsBlank3')[0].hidden = false;
            $('#mercsBlank4')[0].hidden = false;
            $('#mercsBlank5')[0].hidden = false;
            break;
    } 
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
    if (!gParams.verbose) return;
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
    gParams = {};

    $('.hell-sim-param').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        if (el.attr('type') == "checkbox") {
            if (jQuery(el).is(":checked")) {
                gParams[id] = true;
            } else {
                gParams[id] = false;
            }
        } else if (el.val() == "true") {
            gParams[id] = true;
        } else if (el.val() == "false") {
            gParams[id] = false;
        } else if (!isNaN(el.val())) {
            gParams[id] = Number(el.val());
        } else {
            gParams[id] = el.val();
        }
    });
    
    $('.collapser-icon').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        gParams[id] = el.text();
    });
    
}

/* Fill parameter values back to the form */
function SetParams() {
    console.log(gParams);
    for (const key of Object.keys(gParams)) {
        let id = "#" + key;
        let el = $(id);
        if (el.length && gParams[key] != null) {
            if (el.attr('type') == "checkbox") {
                el[0].checked = gParams[key];
            } else if (el.hasClass('collapser-icon')) {
                el.text(gParams[key].toString());
            } else {
                el.val(gParams[key].toString());
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
    $('#instincts')[0].checked = save.race['instinct'] ? true : false;
    $('#kindling')[0].checked = save.race['kindling_kindred'] ? true : false;
    $('#magic')[0].checked = save.race.universe == 'magic' ? true : false;
    $('#parasite')[0].checked = save.race['parasite'] ? true : false;
    $('#pathetic')[0].checked = save.race['pathetic'] ? true : false;
    $('#puny')[0].checked = save.race['puny'] ? true : false;
    $('#rage')[0].checked = save.city.ptrait == 'rage' ? true : false;
    $('#rhinoRage')[0].checked = save.race['rage'] ? true : false;
    $('#regenerative')[0].checked = save.race['regenerative'] ? true : false;
    $('#revive')[0].checked = save.race['revive'] ? true : false;
    $('#scales')[0].checked = save.race['scales'] ? true : false;
    $('#slaver')[0].checked = save.race['slaver'] ? true : false;
    $('#slow')[0].checked = save.race['slow'] ? true : false;
    $('#slowRegen')[0].checked = save.race['slow_regen'] ? true : false;
    $('#smoldering')[0].checked = save.race['smoldering'] ? true : false;
    $('#sniper')[0].checked = save.race['sniper'] ? true : false;
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

    let governor = false;
    if (save.race['governor'] && save.race.governor['tasks']) {
        for (var task in save.race.governor.tasks) {
            if (save.race.governor.tasks[task] == "merc") {
                governor = true;
            }
        }
    }
    if (governor && $('#hireMercs')[0].value == "off") {
        $('#hireMercs')[0].value = "governor";
    } else if (!governor && $('#hireMercs')[0].value == "governor") {
        $('#hireMercs')[0].value = "off";
    }
    if (save.race.governor['config'] && save.race.governor.config['merc'] && save.race.governor.config.merc['buffer'] && save.race.governor.config.merc['reserve']) {
        $('#mercBuffer')[0].value = save.race.governor.config.merc['buffer'];
        $('#mercReserve')[0].value = save.race.governor.config.merc['reserve'];
    }
    
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
    GetParams();
    if (save.portal && save.portal.fortress && save.portal.soul_forge && save.portal.soul_forge.on >= 1) {
        let forgeSoldiers = ForgeSoldiers(gParams);
        if (gParams.defenders >= forgeSoldiers) {
            $('#soulForge')[0].value = 2;
            $('#defenders')[0].value -= forgeSoldiers;
        } else {
            $('#soulForge')[0].value = 1;
        }
    }

    OnChange();
    
}

$(document).ready( function() {
    var traits = $('#cTraits').children();
    var newRow;
    var i;
    for (i = 0; i < traits.length; i++) {
        if (i % 5 == 0) {
            newRow = $('<div>').prop({className: 'row'});
            $('#cTraits').append(newRow);
        }
        newRow.append(traits[i]);
    }
    while (i % 5 != 0) {
        newRow.append('<div class="col"></div>');
        i++;
    }
    $('#cTraits')[0].hidden = false;
   
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
    
    $('.collapser').mousedown(function(e){ e.preventDefault(); });
    $('.collapser').click(function() {
        let icon = $(this).children().first();
        if (icon.text() == "+") { // Currently collapsed
            icon.text("-");
        } else {
            icon.text("+");
        }
        OnChange();
    });

    /* Load params from localStorage */
    paramStr = window.localStorage.getItem('hellSimParams') || false;
    if (paramStr) {
        gParams = JSON.parse(paramStr);
        SetParams();
    }

    OnChange();

    console.log("Ready");
    $('#result').val("Ready\n");
});

